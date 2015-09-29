<?php

class DOMtempl {

	const FRAGMENT	= 0x00000001;
	const PRETTIFY	= 0x00000002;

	public $vars = array();
	public $var_iters = array();

	public function __construct($source, $flags = 0) {
		$this->dom = new DOMDocument();
		//$this->dom->xmlEncoding = 'UTF-8';
		//$this->dom->encoding = 'UTF-8';
		//$this->dom->substituteEntities = true;
		//$this->dom->strictErrorChecking = true;
		//$this->dom->validateOnParse = true;
		if ($flags & self::PRETTIFY) {
			$this->dom->preserveWhiteSpace = false;
		}
		//$this->dom->formatOutput = true;
		if ($flags & self::FRAGMENT) {
			if (!@$this->dom->loadXML( $source, LIBXML_NOERROR | LIBXML_NOWARNING  ))
				throw new Exception('Not a valid DOM Document (passed as arg1)');
			$this->err_file = 'FRAGMENT';
		} else {
			if (!$this->dom->load( $source ))
				throw new Exception('Not a valid DOM Document: '.$source);
			$this->err_file = $source;
		}
		if ($flags & self::PRETTIFY) {
			$this->dom->formatOutput = true;
		}
		//$this->dom->encoding = 'UTF-8';
		$this->parse();
	}

	public function get($id) {
		return $this->getElementById($id);
	}
	/* Unfortunately, dom->getElementById did not work for me, so XPath
	 * For those lacking DOMXPath extensions, a slow, php version
	 * should be written... TODO */
	function getElementById($id)
	{
		$xpath = new DOMXPath($this->dom);
		return $xpath->query("//*[@id='$id']")->item(0);
	}

	private function reflow() {
		/* Reset iteration counters */
		if ($this->var_iters)
			foreach ($this->var_iters as $k=>$v) 
				$this->var_iters[$k] = 0;

		/* Reflow all variables */
		//Profiler::start('replacing vars');
		$this->replace_vars($this->dom);
		//Profiler::end('replacing vars');
	}

	private function XMLtoHTML($str) {

		$str = preg_replace(
			"#\<(script)(.+?)/\>#",
			'<$1$2></$1>', $str);
		$str = preg_replace("#\<\?xml.+\?\>\n#", '', $str);

		return $str;
	}

	public function out() { echo $this->dump(); }

	public function dump() {
		$this->reflow();
		//Profiler::start('writing as HTML');
		if ($this->dom->formatOutput == true) {
			$ret = $this->XMLtoHTML( $this->dom->saveXML() );
		} else
			$ret = $this->dom->saveHTML();
		//Profiler::end('writing as HTML');
		return $ret;
	}

	public function outXML() { echo $this->dumpXML(); }
	public function dumpXML() { $this->reflow(); return $this->dom->saveXML(); }

	public function assign($path, $var) { $this->write_var($path, $var); }

	private function error($message, $name, $path) {
		if (is_callable(array($this->err_node, 'getLineNo')))
			trigger_error($message . '<b title="'.$path.'">'.$name.'</b> in <b>'.$this->err_file."</b> on line <b>".$this->err_node->getLineNo(). "</b> in node <b>".$this->err_node->nodeName."</b><br/>\n");
		else
			trigger_error($message . '<b title="'.$path.'">'.$name.'</b> in <b>'.$this->err_file."</b> in node <b>".$this->err_node->nodeName."</b><br/>\n");
		return null;
	}

	function read_var($path) {
		if (substr($path, 0, 1) == '/') $path = substr($path, 1);
		$walk = preg_split('#(/|\.)#', $path, -1, PREG_SPLIT_DELIM_CAPTURE);

		$cpath = '/';
		$ptr =& $this->vars;
		$last = $walk[ sizeof($walk) - 1 ];
		for ($i = 0; $i < sizeof($walk) - 2; $i += 2) {
			$step = $walk[$i];
			$mod = $walk[$i+1];
			$cpath .= $step;
			if (is_object($ptr) && !($ptr instanceof ArrayAccess)) {
				if (!property_exists($ptr, $step)) {
					$this->error('undefined array ', $step, $cpath);
					return null;
				}
				$ptr =& $ptr->{$step};
			} else {
				if (!isset($ptr[$step])) {
					$this->error('undefined array ', $step, $cpath);
					return null;
				}
				$ptr =& $ptr[$step];
			}
			if ($mod == '/') {
				$n = $this->var_iters[$cpath];
				if (sizeof($ptr) == 0) { 
					$this->error('cant iterate empty array ', $cpath, $cpath);
					return null;
				}

				if (is_object($ptr)) {
					/* HACK! This allows Iteratable/ArrayAccess access somewhat */
					if ($ptr instanceof ArrayAccess) {
						$ptr =& $ptr[$n];
					} else {
						$ptr =& $ptr->{$n};
					}
				} else if (!is_array($ptr)) {
					$this->error('cant iteratate through '.gettype($ptr).' value ', $cpath, $cpath);
					return null;
				} else {
					$keys = array_keys( $ptr ); /* use assoc key, always! */
					//echo "($path) About to extract key $n from ".print_r($keys,1)."<hr>";
				 	$n = $keys[$n];
					$ptr =& $ptr[$n];
				}
				if ($last === '*' && $i == sizeof($walk) - 3) {
					/* Hack -- iterator itself */
					return $n;
				}
				if ($last === '' && $i == sizeof($walk) - 3) {
					break;
				}
			}
			$cpath .= $mod;
		}
		if ($last === '') {
			if (is_array($ptr) || is_object($ptr)) {
				$this->error('array to string conversion ', $path, $path);
				return null;
			}
			return $ptr;
		}

		if (is_object($ptr) && !($ptr instanceof ArrayAccess)) {
			if (!property_exists($ptr, $last)) {
				$this->error('undefined variable ', $last, $path);
				return null;
			}
			$ptr =& $ptr->{$last};
		} else {
			if (is_string($ptr)) {
				$this->error('variable is a string, used as array/object ', $last, $path);
				return null;
			}
			if (!isset($ptr[ $last ])) {
				$this->error('undefined variable ', $last, $path);
				return null;
			}
			$ptr =& $ptr[ $last ];
		}
		/* Another hack to allow ArrayAccess objects */
		if ($ptr instanceof ArrayAccess) {
			if (sizeof($ptr) == 0) return array();
		}
		return $ptr;
	}

	function write_var ($path, $val, $no_overwrite = false) {
		if (substr($path, 0, 1) == '/') $path = substr($path,1);
		$walk = preg_split('#(/|\.)#', $path, -1, PREG_SPLIT_DELIM_CAPTURE);

		$cpath = '/';
		$ptr =& $this->vars;
		$last = $walk[ sizeof($walk) - 1 ];
		for ($i = 0; $i < sizeof($walk) - 2; $i += 2) {
			$step = $walk[$i];
			$mod = $walk[$i+1];
			$cpath .= $step;
			if ($mod == '/') {
				$n = 0;
				if (!isset($ptr[$step]) || $ptr[$step] === true) {
					$ptr[$step] = array( );
					$this->var_iters[$cpath] = 0;
				} else
					$n = $this->var_iters[$cpath];
				$ptr =& $ptr[$step];
				if ($last === '' && $i == sizeof($walk) - 3) break;
				if (!isset($ptr[$n])) $ptr[$n] = array();
				$ptr =& $ptr[$n];
			}
			if ($mod == '.') {
				if (!isset($ptr[$step]) || $ptr[$step] === true)
					$ptr[$step] = array( );
				$ptr =& $ptr[$step];
			}
			$cpath .= $mod;
		}
		if ($last === '') {
			$ptr [ sizeof($ptr) ] = $val;
			return;
		}
		if ($no_overwrite && isset($last[$walk])) return;
		$ptr[ $last ] = $val;
	}

	function expand_path ($node, $base, $path='') {
		if (!$path) $path = $node->getAttribute($base); 
		for ($top = $node->parentNode;
			substr($path, 0, 1) != '/';
			$top = $top->parentNode)
		{
			$top_path = '';
			if (!$top) { $path = '/' . $path; break; }
			if (!$top->hasAttributes()) continue;
			if ($top->hasAttribute('data-from'))
				$top_path = $top->getAttribute('data-from') . '.';
			else if ($top->hasAttribute('data-each'))
				$top_path = $top->getAttribute('data-each') . '/';
			else if ($top->hasAttribute('data-same'))
				$top_path = $top->getAttribute('data-same') . '/';
			else if ($top->hasAttribute('data-when'))
				$top_path = $top->getAttribute('data-when') . '.';

			$path = $top_path . $path;
		}
		return $path;
	}

	function parse_vars_node($root) {
		foreach ($root->childNodes as $node) {

			if ($node->hasAttributes()) {

				if ($node->hasAttribute('data-each'))
					$this->var_iters[
						$this->expand_path($node, 'data-each')
					] = 0;

				if ($node->hasAttribute('data-same'))
					$this->var_iters[
						$this->expand_path($node, 'data-same')
					] ++;

				foreach ($node->attributes as $attr) {
					if (strpos($attr->name, 'data-attr-') !== FALSE) {
						$key = substr($attr->name, strlen('data-attr-'));
						$this->write_var(
							$this->expand_path($node, '', (!$attr->value ? $key : $attr->value)),
							$node->getAttribute($key));
					}
				}

				if ($node->hasAttribute('data-var'))
					$this->write_var(
						$this->expand_path($node, 'data-var'),
						$this->node_get_innerHTML($node) // $node->textContent
					);

				if ($node->hasAttribute('data-when'))
					$this->write_var(
						$this->expand_path($node, 'data-when'), 
						true, 1
					);
			}
			if ($node->childNodes)
					$this->parse_vars_node($node);
		}
	}

	function parse() {
		$this->parse_vars_node($this->dom);
	}

	function safe_clone($elem, $after) {
		$after = ($after ? $after : $elem);
		//if ($elem->cloneNode) {
			$orig = $elem->previousSibling;
			$ident = null;
			if ($orig != null
			&& $orig->nodeType == XML_TEXT_NODE
			&& !trim($orig->wholeText)
			&& $orig->isWhitespaceInElementContent())
				$ident = $orig->cloneNode(false);
			$cln = $elem->cloneNode(true);
			$o = $after->nextSibling; 
			if ($o) {
				if ($ident) $elem->parentNode->insertBefore($ident, $o);
				$elem->parentNode->insertBefore($cln, $o);
			} else {
				if ($ident)	$elem->parentNode->appendChild($ident);
				$elem->parentNode->appendChild($cln);
			}
			return $cln;
		//}
		return null;
	}

	function safe_remove($node) {
		$ident = $node->previousSibling;
		$r = 0;
		if ($ident != null
			&& $ident->nodeType == XML_TEXT_NODE
			&& !trim($ident->wholeText)
			&& $ident->isWhitespaceInElementContent()
			) {
				$ident->parentNode->removeChild($ident);
				$r = 1;
		}
		$node->parentNode->removeChild($node);
		return $r;
	}

	function replace_vars_node($node, $clean) {
		$stop_here = 0; //hack, for speed
		if ($node->hasAttributes()) {
			foreach ($node->attributes as $attr) {
				if (strpos($attr->name, 'data-attr-') !== FALSE) {
					$key = substr($attr->name, strlen('data-attr-'));
					$path = $this->expand_path($node, '', (!$attr->value ? $key : $attr->value));
					$val = $this->read_var($path);
					if ($val !== false)
						$node->setAttribute($key, $val);
					$clean[] = $attr->name;
				}
			}
			if ($node->hasAttribute('data-var')) {
				$clean[] = 'data-var';
				$this->node_set_innerHTML($node, 
					$this->read_var($this->expand_path($node, 'data-var')));
				$stop_here = 1; // do not traverse children of inserted node
				//$node->nodeValue =
					//$this->read_var($this->expand_path($node, 'data-var'));
			}
		}
		if ($node->childNodes && !$stop_here) //stop here if 'data-var' was used
			$this->replace_vars($node);
		foreach ($clean as $cln)
			$node->removeAttribute($cln);
	}

	function replace_vars($root) {
		//foreach ($root->childNodes as $node) {
		for ($i = 0; $i < $root->childNodes->length; $i++) {
			$node = $root->childNodes->item($i);
			$this->err_node =& $node;
			if ($node->nodeType != 1) continue;
			$clean = array();
			if ($node->hasAttributes()) {
				if ($node->hasAttribute('data-when')) {
					if (! $this->read_var($this->expand_path($node, 'data-when')) )	{
						$i -= $this->safe_remove($node);
						continue;
					}
					$clean[] = 'data-when';
				}
				if ($node->hasAttribute('data-same')) {
					$clean[] = 'data-same';
					continue;
				}
				if ($node->hasAttribute('data-each')) {
					$clean[] = 'data-each';
					$path = $this->expand_path($node, 'data-each');
					$arr = $this->read_var($path);
					/* Kill marked siblings */
					$kill = $node->nextSibling;
					while ($kill) {
						$next = $kill->nextSibling;
						if ($kill->hasAttributes() && $kill->hasAttribute('data-same'))
							$this->safe_remove($kill);
						$kill = $next;
					}
					/* Clone new siblings */
					if (is_array($arr) || is_object($arr)) {
						$last = null;
						for ($j = 1; $j < sizeof($arr); $j++) {
							$this->var_iters[$path] = $j;
							$nod = $this->safe_clone($node, $last);
							$last = $nod;
							$nod->removeAttribute('data-each');
							$nod->setAttribute('data-same', $path);
							$this->replace_vars_node($nod, array('data-same'));
						}
						$this->var_iters[$path] = 0;
					}
				}
			}
			$this->replace_vars_node($node, $clean);
		}
	}

	function node_get_innerHTML($node) {
		$innerHTML= '';
		$children = $node->childNodes;
		foreach ($children as $child) {
			$innerHTML .= $child->ownerDocument->saveXML( $child );
		}
		return $innerHTML;
	}
	/* this code is lifted from a nifty "JavaScript-like innerHTML access" class
	 * http://www.keyvan.net/2010/07/javascript-like-innerhtml-access-in-php/ */
	function node_set_innerHTML($node, $value) {
		/* HACK -- Ensure this is a string */
		if (is_bool($value)) $value = '';
		if (is_numeric($value) || !$value) $value = ''.$value;
		if (!is_string($value)) { $this->error(gettype($value)." is not a scalar var ", $this->expand_path($node,'data-var'), ""); $value=''; }

		/* HACK -- If it doesn't contain < and > symbols, treat it as text */
		//file_put_contents("/tmp/domerror.log", "\n\n".$node->nodeName." '$value' -- ((( ".$node->ownerDocument->saveXML($node)."))) [[[".$value."]]]", FILE_APPEND);
		if (strpbrk($value, '<>&') === false) {
			$node->nodeValue = $value;
			return;
		}

		for ($x = $node->childNodes->length - 1; $x >= 0; $x--)
			$node->removeChild($node->childNodes->item($x));

		if ($value != '') {
			$f = $node->ownerDocument->createDocumentFragment();
			$result = @$f->appendXML($value);
			if ($result) {
				if ($f->hasChildNodes()) $node->appendChild($f);
			} else {
				$f = new DOMDocument();
				//$f->substituteEntities = true;
				//$f->xmlEncoding = 'UTF-8';
				//$value = mb_convert_encoding($value, 'HTML-ENTITIES', 'UTF-8');
				//$value = htmlspecialchars($value, null, 'UTF-8');
				$result = @$f->loadHTML(
				"<meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\" />" 
				. '<htmlfragment>'.$value.'</htmlfragment>');
				$f->encoding = 'UTF-8';
				//$f->saveHTMLfile('gadl.txt');
				if ($result) {
					$import = $f->getElementsByTagName('htmlfragment')->item(0);
					foreach ($import->childNodes as $child) {
						$importedNode = $node->ownerDocument->importNode($child, true);
						$node->appendChild($importedNode);
					}
				}
			}
		}
	}

}

?>