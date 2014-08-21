DOMtempl.FRAGMENT = 0x00000001;

function DOMtempl(doc, flags) { var newdomtempl = {

	vars: { },
	var_iters: { },

	dom: null,

	errlog : '',
	error: function (err) {
		this.errlog += err + '\n';
	},

	init: function (doc, flags) {
		flags = flags || 0;
		doc = doc || document;

		if (flags & DOMtempl.FRAGMENT) {

			var d = document.createElement('DIV');
			d.innerHTML = doc;
			this.dom = d;

		} else {

			this.dom = doc;

		}
		this.parse();
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
			if (!isset(ptr, step)) {
				this.error('undefined array "' + step + '" of path ' + path);
				return null; 
			}
			ptr = ptr[step];
			if (mod == '/') {
				var n = this.var_iters[cpath];
//				alert("Sub str... "+ cpath + ' going to use iter '+ n)
				if (!isset(ptr, n)) {
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
				if (!isset(ptr, n)) ptr[n] = { };
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

			if (node.nodeType == /*ELEMENT_NODE*/1 && node.hasAttributes()) {

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
		//this.var_dump();
	},

	get: function (id) {
		return document.getElementById(id);
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

	safe_remove: function(node) {
		var ident = node.previousSibling;
		var r = 0;
		if (ident != null
			&& ident.nodeType == /*TEXT_NODE*/3
			&& !ident.textContent.trim()
			//&& !ident.wholeText.trim()
			//&& ident.isElementContentWhitespace
		) {
			ident.parentNode.removeChild(ident);
			r = 1;
		}

		node.parentNode.removeChild(node)
		return r;
	},

	safe_clone: function(elem, after) {
		after = after || elem;
		if (elem.cloneNode) {

			var orig = elem.previousSibling;
			var ident = null;
			if (orig != null
			&& orig.nodeType == /*TEXT_NODE*/3
			&& !orig.textContent.trim()
			//&& !orig.wholeText.trim()
			//&& orig.isElementContentWhitespace
			)
				ident = orig.cloneNode(false);

			var cln = elem.cloneNode(true);
			var o = after.nextSibling;
			if (o) {
				if (ident) elem.parentNode.insertBefore(ident, o);
				elem.parentNode.insertBefore(cln, o);
			}
			else {
				if (ident) elem.parentNode.appendChild(ident);
				elem.parentNode.appendChild(cln);
			}
			return cln;
		}
		return null;
	},

	replace_vars_node: function (node, clean) {
		var stop_here = 0; //hack, for speed
		if (node.nodeType == /*ELEMENT_NODE*/1 && node.hasAttributes()) {

			for (var j = 0; j < node.attributes.length; j++) {
				var attr = node.attributes[j];
				if (attr.name.indexOf('data-attr-') != -1) {
					var key = attr.name.substring('data-attr-'.length);
					var path = this.expand_path(node, '', (!attr.value ? key : attr.value));
					var val = this.read_var(path);
					if (val !== false)
						node.setAttribute(key, val);
					clean.push( attr.name );
				}
			}

			if (node.hasAttribute('data-var')) {
				clean.push('data-var');
				node.innerHTML =
					this.read_var(this.expand_path(node, 'data-var'));
				stop_here = 1; // do not traverse children of inserted node
			}
		}

		if (node.childNodes && !stop_here) //stop here if 'data-var' was used
			this.replace_vars(node);
		for (attr in clean)
			node.removeAttribute(clean[attr]);
	},

	replace_vars : function (root) {
		for (var i = 0; i < root.childNodes.length; i++) {
			var node = root.childNodes[i];
			var clean = [ ];
			if (node.nodeType == /*ELEMENT_NODE*/1 && node.hasAttributes()) {
				if (node.hasAttribute('data-when')) {
					if (! this.read_var(this.expand_path(node, 'data-when')) ) {
						i -= this.safe_remove(node);
						continue;
					}
					clean.push( 'data-when' );
				}

				if (node.hasAttribute('data-same')) {
					clean.push( 'data-same' );
					continue;
				}
				if (node.hasAttribute('data-each')) {
					clean.push( 'data-each' );
					var path = this.expand_path(node, 'data-each');
					var arr = this.read_var(path);

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
							this.replace_vars_node(nod, ['data-same']);
						}
//						alert("Setting iter for "+path+" as 0 !");
						this.var_iters[path] = 0;
					}
				}
			}
			this.replace_vars_node( node, clean );
		}
	}
//EndFunction
}; newdomtempl.init(doc, flags); return newdomtempl; };


function DOMtemplEditor(templ) { var neweditor = {

	templ: null,
	place : null,
	editor : null,

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
		var ta = document.createElement('TEXTAREA');
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

	init: function(templ) {
		this.templ = templ;
		this.templ.replace_vars = this.pretend_replace_vars;
		this.templ.replace_vars_node = this.pretend_replace_vars_node;
	},

	initEditor: function() {
		this.create_placeholder();
		//this.add_modlink('parse', 'this.parse();');
		this.add_modlink('vardump', 'var_dump');
		this.add_modlink('__VAR_IN__', 'var_in');
		this.add_editor();
		this.append_placeholder();
		var self = this;
		window.addEventListener("keydown", function(e) { self.key_react(e); }, false);
		this.var_dump();
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
		this.editor_set(JSON.stringify(templ.vars, null, 4));
	},

	var_in: function () {
		var vars = JSON.parse(this.editor_get());
		templ.vars = vars;
		templ.reflow();
	},

	pretend_replace_vars_node: function (node, clean) {
		var stop_here = 0; //hack, for speed
		if (node.nodeType == /*ELEMENT_NODE*/1 && node.hasAttributes()) {

			for (var j = 0; j < node.attributes.length; j++) {
				var attr = node.attributes[j];
				if (attr.name.indexOf('data-attr-') != -1) {
					var key = attr.name.substring('data-attr-'.length);
					var path = this.expand_path(node, '', (!attr.value ? key : attr.value));
					var val = this.read_var(path);
					if (val !== false)
						node.setAttribute(key, val);
					clean.push( attr.name );
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
				clean.push('data-var');
				node.innerHTML = 
					this.read_var(this.expand_path(node, 'data-var'));
				stop_here = 1; // do not traverse children of inserted node
			}
		}

		if (node.childNodes && !stop_here) //stop here if 'data-var' was used
			this.replace_vars(node);
	},

	pretend_replace_vars : function (root) {
		for (var i = 0; i < root.childNodes.length; i++) { 
			var node = root.childNodes[i];
			var clean = [ ];
			if (node.nodeType == /*ELEMENT_NODE*/1 && node.hasAttributes()) {

				if (node.hasAttribute('data-same')) continue;

				if (node.hasAttribute('data-each')) {
					clean.push( 'data-each' );
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
							this.replace_vars_node(nod, ['data-same']);
						}
//						alert("Setting iter for "+path+" as 0 !");
						this.var_iters[path] = 0;
					} else {
						/* Hide first element */
						node.style.display = 'none';
					}
				}
			}
			this.replace_vars_node( node, clean );
		}
	}

//EndFunction
}; neweditor.init(templ); return neweditor; };

if (typeof document !== 'undefined'
&& document.documentElement.className.indexOf("domtempl") != -1)
	window.addEventListener('load', function() {
		var templ = new DOMtempl(document);
		var editor = new DOMtemplEditor(templ);
		editor.initEditor();
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

/* be a node.js module */
if (typeof module !== 'undefined')
module.exports = DOMtempl;
