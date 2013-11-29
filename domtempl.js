DOMtempl.FRAGMENT = 0x00000001;

function DOMtempl(doc, flags) { var newdomtempl = {

	vars: { },
	var_iters: { },

	dom: null,

	place : null,
	editor : null,

	errlog : '',

	error: function (err) {
		this.errlog += err + '\n';
	},

	create_placeholder : function () {
		this.place = document.createElement('DIV');
		this.place.id = 'templ_placeholder'
		this.place.style.position = 'fixed';
		this.place.style.bottom = 0;
		this.place.innerHTML = '<kbd>SHIFT</kbd>-';
	},

	append_placeholder: function () {
		document.body.appendChild(this.place);
	},

	toggle_placeholder: function () {
		this.place.style.display =
			(this.place.style.display == 'none' ? '' : 'none');
	},

	add_editor: function() {
		var ta = document.createElement('textarea');
		ta.id = 'main_templ_editor';
		ta.value = '';// this.var_dump();
		ta.cols = 80;
		ta.rows = 24

		this.place.appendChild(ta);

		this.editor = ta;

		this.place.style.backgroundColor = '#fff';
		this.place.style.border = '1px solid black';
		this.place.style.width = '100%';
	},

	add_modlink: function(name, func) {
		var self = this;
		var wrap = function(e) { self[func](e); e.preventDefault(); return false; };
		var opt = document.createElement('a');
		//opt.href = 'javascript:' + func;
		opt.href = 'javascript:void();';
		opt.addEventListener('click', wrap, false);
		opt.innerHTML = name;
		this.place.appendChild(opt);
	},

	key_react: function (e) {
		var btn = e.keyCode;
		if (e.target.nodeName == 'TEXTAREA' || e.target.nodeName == 'INPUT')
			return false;
		if (btn == 16) this.toggle_placeholder();
	},

	init: function (doc, flags) {
		flags = flags || 0;
		doc = doc || document;

		if (flags & DOMtempl.FRAGMENT) {

			var d = document.createElement('div');
			d.innerHTML = doc;
			this.dom = d;

		} else {

			this.dom = doc;

		}
		this.parse();
	},

	initEditor: function() {
		this.create_placeholder();
		//		this.add_modlink('parse', 'this.parse();');
		this.add_modlink('vardump', 'var_dump');
		this.add_modlink('__VAR_IN__', 'var_in');
		this.add_editor();
		this.append_placeholder();
		var self = this;
		window.addEventListener("keydown", function(e) { self.key_react(e); }, false);

		this.var_dump();
	},

	read_var: function (path) {
		if (path.substring(0, 1) == '/') path = path.substring(1);
		var walk = path.split(/(\.|\/)/);//, -1, PREG_SPLIT_DELIM_CAPTURE);
//alert('must resolve ' + path);
		var cpath = '/';
		var ptr = this.vars;
		var last = walk[ walk.length - 1 ];		
		for (var i = 0; i < walk.length - 2; i+=2) {
			var step = walk[i];
			var mod = walk[i+1];
			cpath += step;
			if (!isset(ptr, step))	{
				this.error('undefined array "' + step + '" of path ' + path);
				return null; 
			}
			ptr = ptr[step];
			if (mod == '/') {
				var n = this.var_iters[cpath];
//				alert("Sub str... "+ cpath + ' going to use iter '+ n)
				if (!isset(ptr, n))	{
					this.error('cant iterate through "' + n + '" of path ' + path);
					return null; 
				}
				ptr = ptr[n];
				if (last === '*' && i == walk.length - 3) return n;/* Hack -- iterator itself */
				if (last === '' && i == walk.length - 3) break;
			}
			cpath += mod;
		};
		if (last === '') {
			return ptr;
		}
		if (!isset(ptr, last)) {
			this.error('undefined variable "'+last+'" of path "' + path + '"');
			return null;
		}
		return ptr[ last ];
	},

	write_var: function (path, val, no_overwrite) {
		if (path.substring(0, 1) == '/') path = path.substring(1);
		var walk = path.split(/(\.|\/)/);//, -1, PREG_SPLIT_DELIM_CAPTURE);

		var cpath = '/';
		var ptr = this.vars;
		var last = walk[ walk.length - 1 ];		
		for (var i = 0; i < walk.length - 2; i+=2) {
			var step = walk[i];
			var mod = walk[i+1];
			cpath += step;
			if (mod == '/') {
				var n = 0;
				if (!isset(ptr, step) || ptr[step] === true) {
					ptr[step] = [ ];
					this.var_iters[cpath] = 0;
				}
				else n = this.var_iters[cpath];
				ptr = ptr[step];
				if (last === '' && i == walk.length - 3) break;
				if (!isset(ptr, n))	ptr[n] = { };
				ptr = ptr[n];
			}
			if (mod == '.') {
				if (!isset(ptr, step) || ptr[step] === true)
					ptr[step] = { };
				ptr = ptr[step];
			}
			cpath += mod;
		};
		if (last === '') {
			ptr[ ptr.length ] = val;
			return;
		}
		if (no_overwrite && isset(ptr, last)) return;
		ptr[ last ] = val;
	},

	expand_path : function (node, base, path) {
		if (path === undefined) path = node.getAttribute(base);
		for (var top = node.parentNode;
			path.substring(0, 1) != '/';
			top = top.parentNode) 
		{
			var top_path = '';
			if (!top) { path = '/' + path; break; }
			if (!top.hasAttributes()) continue;
			if (top.hasAttribute('data-from'))
				top_path = top.getAttribute('data-from') + '.';
			else if (top.hasAttribute('data-each'))
				top_path = top.getAttribute('data-each') + '/';
			else if (top.hasAttribute('data-same'))
				top_path = top.getAttribute('data-same') + '/';
			else if (top.hasAttribute('data-when'))
				top_path = top.getAttribute('data-when') + '.';
			path = top_path + path;
		}
		return path;
	},

	parse_vars_node: function (root) {
		for (var i in root.childNodes) {
			var node = root.childNodes[i];
			//alert(node.nodeType);
			//if (node.nodeType == 3) continue;
			if (!node.hasAttributes) continue;

			if (node.hasAttributes()) {

				if (node.hasAttribute('data-each'))
					this.var_iters[
						this.expand_path(node, 'data-each')
					] = 0;

				if (node.hasAttribute('data-same'))
					//alert('adding with ' + node),
					this.var_iters[
						this.expand_path(node, 'data-same') 
					] ++;

				for (var j = 0; j < node.attributes.length; j++) {
					var attr = node.attributes[j];
					if (attr.name.indexOf('data-attr-') != -1) {
						var key = attr.name.substring('data-attr-'.length);
						this.write_var(
							this.expand_path(node, '', (!attr.value ? key : attr.value)), 
							node.getAttribute(key)); 
					}
				}

				if (node.hasAttribute('data-var'))
					this.write_var(
						this.expand_path(node, 'data-var'), 
						node.textContent
					);

				if (node.hasAttribute('data-when'))
					this.write_var(
						this.expand_path(node, 'data-when'), 
						true, 1
					);
			}

			if (node.childNodes)
				this.parse_vars_node(node);
		} 
	},

	parse: function () {
		this.parse_vars_node(this.dom);
		this.var_dump();
	},

	get: function (id) {
		return document.getElementById(id);	
	},

	editor_set: function (text) {
		var obj = this.editor;
		if (!obj) return;
		if (obj.setValue) obj.setValue(text);
		else obj.value = text;
	},

	editor_get: function (text) {
		var obj = this.editor;
		if (!obj) return;
		if (obj.getValue) return obj.getValue();
		else return obj.value;
	},

	var_dump: function () {
		this.editor_set(JSON.stringify(this.vars, null, 4));
	},

	var_in: function () {
		var vars = JSON.parse(this.editor_get());
		this.vars = vars;
		this.reflow();
	},

	reflow: function () {
		/* Reset iteration counters */
		if (this.var_iters)
			for (var i in this.var_iters)
				this.var_iters[i] = 0;

		/* Reflow all variables */
		this.replace_vars(this.dom);
	},

	dump: function () {
		this.reflow();
		var ret = this.dom.documentElement.outerHTML;
		return ret;
	},

	out: function() {
		document.write( this.dump() );
	},

	safe_clone: function(elem, after) {
		after = after || elem;
		if (elem.cloneNode) {
			var cln = elem.cloneNode(true);
			var o = after.nextSibling; 
			if (o)
				elem.parentNode.insertBefore(cln, o);
			else
				elem.parentNode.appendChild(cln);
			return cln;
		}
		return null;
	},

	replace_vars_node: function (node) {
		var stop_here = 0; //hack, for speed		
		if (node.hasAttributes()) {	

			for (var j = 0; j < node.attributes.length; j++) {
				var attr = node.attributes[j];
				if (attr.name.indexOf('data-attr-') != -1) {
					var key = attr.name.substring('data-attr-'.length);
					var path = this.expand_path(node, '', (!attr.value ? key : attr.value));
					var val = this.read_var(path);
					if (val !== false)
						node.setAttribute(key, val);
				}
			}

			if (node.hasAttribute('data-when')) {
				if (! this.read_var(this.expand_path(node, 'data-when')) )
				{ 
					node.style.display = 'none';
					return false;
				}
				else if (node.style.display == 'none')
					node.style.display = '';
			}

			if (node.hasAttribute('data-var')) {
				node.innerHTML = 
					this.read_var(this.expand_path(node, 'data-var'));
				stop_here = 1; // do not traverse children of inserted node
			}
		}

		if (node.childNodes && !stop_here) //stop here if 'data-var' was used
			this.replace_vars(node);
	},
 
 	replace_vars : function (root) {
		for (var i = 0; i < root.childNodes.length; i++) { 
			var node = root.childNodes[i];
			if (node.hasAttributes()) {
				if (node.hasAttribute('data-same')) continue;
				if (node.hasAttribute('data-each')) {
					var path = this.expand_path(node, 'data-each');
					var arr = this.read_var(path);

					/* Unhide first element */
					if (node.style.display == 'none')
						node.style.display = '';

					/* Kill marked siblings */
					var kill = node.nextSibling;
					while (kill) {
						var next = kill.nextSibling;
						if (kill.hasAttributes() && kill.hasAttribute('data-same'))
							kill.parentNode.removeChild(kill);
						kill = next;
					}
					if (is_array(arr) && arr.length) {
						/* Clone new siblings */
						var last = null;
						for (var j = 1; j < arr.length; j++) {
							this.var_iters[path] = j;
//							alert("Setting iter for "+path+" as " + j);
							var nod = this.safe_clone(node, last);
							last = nod;
							nod.removeAttribute('data-each');
							nod.setAttribute('data-same', path);
							this.replace_vars_node(nod);
						}
//						alert("Setting iter for "+path+" as 0 !");
						this.var_iters[path] = 0;
					} else {
						/* Hide first element */
						node.style.display = 'none';
					}
				}
			}
			this.replace_vars_node( node );
		}
	}
//EndFunction
}; newdomtempl.init(doc, flags); return newdomtempl; };


if (document.documentElement.className.indexOf("domtempl") != -1)
	window.addEventListener('load', function() {
		var templ = new DOMtempl(document);
		templ.initEditor();
	}, false);


function isset(a, i) {
	if (a[i] === undefined || a[i] === null) return false;
	return true;
}
function is_array(input){
	return typeof(input) == 'object' && (input instanceof Array);
}

/**
 * Forces a reload of all stylesheets by appending a unique query string
 * to each stylesheet URL.
 * http://stackoverflow.com/questions/2024486
 */
function reloadStylesheets() {
    var queryString = '?reload=' + new Date().getTime();
    var sheets = document.getElementsByTagName('link');
    for (var i = 0; i < sheets.length; i++) {
    	if (sheets[i].rel.indexOf('stylesheet') != -1)
    	sheets[i].href = sheets[i].href.replace(/\?.*|$/, queryString);
    }
    setTimeout(reloadStylesheets, 1000);
}
