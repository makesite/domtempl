<?php

require 'domtempl.php';

class DOMtempl_writer extends DOMtempl {

	const DEBUG_TAGS        = 0x10000000;
	const SAVE_DEFAULTS     = 0x20000000;
	const EXTERNAL_DEFAULTS = 0x40000000;
	const NO_WRITE          = 0x80000000;

	public $from = 'data';
	public $ident = '    ';
	public $lt = '<';
	public $gt = '>';

	protected $iter_as = array();
	protected $iter_depth = 0;

	protected $template = '';
	protected $varfile = '';

	public function __construct($source, $flag = 0, $dir = 'templates') {

		if ($flag & self::DEBUG_TAGS) {
			$this->lt = '&lt;';
			$this->gt = '&gt;';
		}

		//fragments are never compiled...
		if ($flag & parent::FRAGMENT) {
			return parent::__construct($source, $flag);
		}

		//files *could* be compiled
		$comp_name = str_replace(array('/'), '.', $source);
		while (strpos($comp_name, '..') !== false)
			$comp_name = preg_replace('/\.\./', '.', $comp_name, -1);
		$comp_name = trim($comp_name, '.');

		$vars_are_outdated = null;
		//check if var file already exists
		if ($flag & self::EXTERNAL_DEFAULTS) {
			$this->varfile = $dir . '/' . 'vars__' . $comp_name;
			if (file_exists($this->varfile) // file exists and is new enough 
			&& filemtime($this->varfile) >= filemtime($source)) {
				//load them
				$vars_are_outdated = false;
			} else if (!($flag & self::NO_WRITE)) {
				//write them
				$vars_are_outdated = true;
			}
		}

		//check if compiled version already exists
		$this->template = $dir . '/' . $comp_name; 
		if (file_exists($this->template) // file exists and is new enough 
		&& filemtime($this->template) >= filemtime($source)) {
			$this->load_defaults();//load the defaults
			return; // and do nothing else
		}

		//check dir
		if (!($flag & self::NO_WRITE)) {
			if (!is_dir($dir) || !is_writable($dir)) {
				throw new Exception("Directory `$dir` doesn't appear to exist or be writable");
			}
		}

		parent::__construct($source, $flag);

		if ($flag & self::NO_WRITE) return;

		$this->write( ($flag & self::SAVE_DEFAULTS) );

		$this->writeDefaults();
	}
	
	function writeDefaults() {
		$php_code = $this->renderDefaults();
		if (!@file_put_contents($this->varfile, $php_code, LOCK_EX)) {
			throw new Exception('Unable to write vars file `'.$this->varfile.'` for template `'.$source.'`');
		}
		chmod($this->varfile, 0666);
	}	
	
	function write($with_defaults = false) {
		$php_code = $this->compile( $with_defaults );
		if (!@file_put_contents($this->template, $php_code, LOCK_EX)) {
			throw new Exception('Unable to write file `'.$this->template.'` for template `'.$source.'`');
		}
		chmod($this->template, 0666);
	}

	function load_defaults() {
		if (!$this->varfile) return;

		include $this->varfile;
		$vars = get_defined_vars();

		if ($this->from) {
			$this->vars = $vars[$this->from];
		} else {
			$this->vars = $vars;
		}
		
	}

	function convert_path($path) {
		$ret = '';	

		if ($this->from) {
			$opener = '$'.$this->from.'[\'';
			$ender = '\']';
		} else {
			$opener = '$';
			$ender = '';
		}

		if (substr($path, 0, 1) == '/') $path = substr($path,1);
		$walk = preg_split('#(/|\.)#', $path, -1, PREG_SPLIT_DELIM_CAPTURE);

		$cpath = '/';
		$last = $walk[ sizeof($walk) - 1 ];
		for ($i = 0; $i < sizeof($walk) - 2; $i += 2) {
			$step = $walk[$i];
			$mod = $walk[$i+1];
			$cpath .= $step;
			if ($mod == '/') {
				$n = 0;
				if (isset($this->iter_as[$cpath])) {
					$n = $this->iter_as[$cpath];
					$ret = '$v'.$n;
				}
				else {
					echo "Danger zone...";
					var_dump($this->iter_as);
					//danger zone...
					if ($i == 0) $ret .= '$?';
					$ret .= '[' . $cpath . ']';
				}
				if ($last === '*' && $i == sizeof($walk) - 3) {
					$ret = '$k'.$n;
					$last = '';
					break;
				}
				if ($last === '' && $i == sizeof($walk) - 3) break;
			}
			if ($mod == '.') {
				$ret .= $opener . $step . $ender;
			}
			$cpath .= $mod;
			$opener = '[\''; $ender = '\']';
		};
		if ($last !== '') {
			$ret .= $opener . $last . $ender;
		}

		return $ret;
	}

	function renderNode($node, $ident = '') {

		$silent = 0;
		if (substr($node->nodeName, 0,1) == '#' || $node->nodeType != 1) {
			$silent = 1;
		}

		$ctr = array();
		$attrs = array();
		$repattr = array();

		if ($node->hasAttributes()) {

			if ($node->hasAttribute('data-same')) return;

			foreach ($node->attributes as $attr) {
				if (in_array($attr->name, array('data-when','data-each','data-same','data-var'))) {
					$ctr[ substr($attr->name, strlen('data-')) ] = 
						$this->expand_path($node, '', $attr->value);
					continue;
				}
				if (strpos($attr->name, 'data-attr-') !== FALSE) {
					$key = substr($attr->name, strlen('data-attr-'));
					$path = $this->expand_path($node, '', $attr->value);
					$repattr[$key] = $path;
				} else {
					$attrs[$attr->name] = $attr->value;
				}
			}
		}

		$head = '';
		$body = '';
		$tail = '';

		if (isset($ctr['when'])) {
			$path = $this->convert_path($ctr['when']);

			//enter if
			$head .= $ident . $this->lt .'?php if ('.$path.') {' . ' ?'.$this->gt."\n";
			$tail .= $ident . $this->lt .'?php } ?'.$this->gt."\n";
		}

		if (isset($ctr['each'])) {
			$orig_path = $ctr['each'];
			$path = $this->convert_path($orig_path);

			//enter loop
			$this->iter_depth++;
			$this->iter_as[$orig_path] = $this->iter_depth;
			
			$head .= $ident.$this->lt.'?php foreach ('.$path.' as $k'.$this->iter_depth.' => $v'.$this->iter_depth.') {'.' ?'.$this->gt."\n";
			$tail .= $ident.$this->lt.'?php } ?'.$this->gt."\n";
		}

		if (!$silent) {
			//replace attributes values
			foreach ($repattr as $key => $path)	
				$attrs[$key] = $this->lt.'?= '. $this->convert_path($path) .' ?'.$this->gt;

			//opening and closing tag (with attributes) 
			$head .= $ident . $this->lt. $node->nodeName;
			foreach ($attrs as $k => $v) $head .= ' ' . $k . '="' . $v .'"';
			//$head .= $this->gt."\n";
			//$tail = $ident . '&lt;/'.$node->nodeName.$this->gt."\n" . $tail;
			if (in_array($node->nodeName, array('img'))) {
				$head .= '/'.$this->gt;
			} else {
				$head .= $this->gt;
				$tail = $this->lt.'/'.$node->nodeName.$this->gt. "\n" . $tail;
			}
		}

		// body		
		if (isset($ctr['var'])) {
			$path = $this->convert_path($ctr['var']);
			$body .= $ident . $this->ident . $this->lt . '?= '. $path . ' ?'. $this->gt."\n";
		}
		else for ($c = $node->firstChild; $c; $c = $c->nextSibling) {
			$body .= $this->renderNode( $c, $ident . ($silent ? '' : $this->ident) );
		}

		// adjust head & tail
		if ($body) {
			$head .= "\n";
			$tail = $ident . $tail;
		}

		// exit loop
		if (isset($ctr['each'])) {
			$this->iter_depth--;
		}

		return $head . $body . $tail;
	}

	function compile($defaults = false) {
		return ($defaults ? $this->renderDefaults() : '') 
			   . $this->renderNode($this->dom);	
	}

	function render() {
		echo $this->compile();	
	}

	function renderDefaults() {
		$out = $this->lt . '?php '. "\n";
		foreach ($this->vars as $key => $val) {
			$name = $this->convert_path($key);
			$out .= 'if (!isset('.$name.')) '.$name.' = ' . var_export($val, 1) . ';' . "\n";
		}
		$out .= '?'.$this->gt . "\n";
		return $out;
	}

	// over-ride DOM_templ methods to actually use a compiled template sometimes
	function out() { // echo
		if ($this->template) {
			$data = $this->vars;
			include $this->template;
		} else {
			return parent::out();
		}
	}
	function dump() { //return
		if ($this->template) {
			$data = $this->vars;
			ob_start();
			include $this->template;
			$ret = ob_get_contents();
			ob_end_clean();
			return $ret;
		} else {
			return parent::dump();
		}
	}

}

//echo "<pre>";

ini_set('display_errors', 1);
error_reporting(E_ALL | E_NOTICE | E_STRICT);

$x = new DOMtempl_writer('../../louder.ru/admin/design/design.html', DOMtempl_writer::EXTERNAL_DEFAULTS | DOMtempl_writer::SAVE_DEFAULTS, '../../louder.ru/admin/templates');
//$x = new DOMtempl('../../louder.ru/admin/design/design.html');
print_r($x->vars);

/*
$x = new DOM_templ_writer('<html><body><span data-when="t.off">show or not</span><a data-each="links" class="middle" data-attr-href="/links/" data-attr-bob="/links/*"><p data-var="title"></p></a><div data-var="mario">aaa</div>'.

'<ul>'.
'<li data-each="books">'.
'	<p data-each="property">'.
'		<span data-var="name"></span>'.
'		<span data-var="value"></span>'.
'		<h1 data-var="/books/title"></h1>'.
'	</p>'.
'</li>'.
'</ul>'.

'</body></html>', HTML_templ::FRAGMENT);
*/
//$x->render();

$x->out();

?>