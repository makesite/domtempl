var templ = {

	vars: { },
	var_iters: { },
	
	place : null,
	editor : null,

	errlog : '',

	error: function (err) {
		templ.errlog += err + '\n';
	},

	create_placeholder: function () {
		templ.place = document.createElement('DIV');
		templ.place.id = 'templ_placeholder'
		templ.place.style.position = 'fixed';
		templ.place.style.bottom = 0;
	//	opt.style.display = 'none';
		templ.place.innerHTML = '<kbd>SHIFT</kbd>-';
		//add_toggle(opt.id, opt);
	},

	append_placeholder: function () {
		document.body.appendChild(templ.place);
	},

	toggle_placeholder: function () {
		templ.place.style.display = 
			(templ.place.style.display == 'none' ? '' : 'none');
	},

	add_editor: function() {
		var ta = document.createElement('textarea');
		ta.id = 'main_templ_editor';
		ta.value = '';// templ.var_dump();
		ta.cols = 80;
		ta.rows = 24

		templ.place.appendChild(ta);

    	templ.editor = ta;

	    templ.place.style.backgroundColor = '#fff';
	    templ.place.style.border = '1px solid black';
	    templ.place.style.width = '100%';
	},

	add_modlink: function(name, func) {
		var opt = document.createElement('a');
		opt.href = 'javascript:' + func;
		opt.innerHTML = name;
		templ.place.appendChild(opt);
	},

	init: function () {
		//templ.analyze_lazy();
		//templ.analyze_flat();
		//templ.expand_deep(document);
		//templ.analyze_dom();
		////templ.execute_repeat();
		//templ.hash_react();

		templ.create_placeholder();
		//templ.populate_placeholder();

//		templ.add_modlink('parse', 'templ.parse();');

		templ.add_modlink('vardump', 'templ.var_dump();');		
		templ.add_modlink('__VAR_IN__', 'templ.var_in();');
		//templ.add_modlink('var_from_ls', 'templ.var_load();');

		templ.add_editor();

		templ.append_placeholder();
		//templ.append_accesskeys();
		templ.parse();

		//templ.map_hash();

		window.addEventListener("keydown", templ.key_react, false);
	},

	key_react: function (e) {
		var btn = e.keyCode;
		if (e.target.nodeName == 'TEXTAREA' || e.target.nodeName == 'INPUT')
			return false;
		if (btn == 16) templ.toggle_placeholder();
	},

	setup: function () {
		window.addEventListener('load', templ.init, false);	
	},

	read_var: function (path) {
		if (path.substring(0, 1) == '/') path = path.substring(1);
		var walk = path.split(/(\.|\/)/);//, -1, PREG_SPLIT_DELIM_CAPTURE);
//alert('must resolve ' + path);
		var cpath = '/';
		var ptr = templ.vars;
		var last = walk[ walk.length - 1 ];		
		for (var i = 0; i < walk.length - 2; i+=2) {
			var step = walk[i];
			var mod = walk[i+1];
			cpath += step;
			if (!isset(ptr, step))	{
				templ.error('undefined array "' + step + '" of path ' + path);
				return null; 
			}
			ptr = ptr[step];
			if (mod == '/') {
				var n = templ.var_iters[cpath];
//				alert("Sub str... "+ cpath + ' going to use iter '+ n)
				if (!isset(ptr, n))	{
					templ.error('cant iterate through "' + n + '" of path ' + path);
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
			templ.error('undefined variable "'+last+'" of path "' + path + '"');
			return null;
		}
		return ptr[ last ];
	},

	write_var: function (path, val, no_overwrite) {
		if (path.substring(0, 1) == '/') path = path.substring(1);
		var walk = path.split(/(\.|\/)/);//, -1, PREG_SPLIT_DELIM_CAPTURE);

		var cpath = '/';
		var ptr = templ.vars;
		var last = walk[ walk.length - 1 ];		
		for (var i = 0; i < walk.length - 2; i+=2) {
			var step = walk[i];
			var mod = walk[i+1];
			cpath += step;
			if (mod == '/') {
				var n = 0;
				if (!isset(ptr, step) || ptr[step] === true) {
					ptr[step] = [ ];
					templ.var_iters[cpath] = 0;
				}
				else n = templ.var_iters[cpath];
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
			ptr [ ptr.length ] = val;
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
					templ.var_iters[
						templ.expand_path(node, 'data-each') 
					] = 0;

				if (node.hasAttribute('data-same'))
					//alert('adding with ' + node),
					templ.var_iters[
						templ.expand_path(node, 'data-same') 
					] ++;

				for (var j = 0; j < node.attributes.length; j++) {
					var attr = node.attributes[j];
					if (attr.name.indexOf('data-attr-') != -1) {
						var key = attr.name.substring('data-attr-'.length);
						templ.write_var(
							templ.expand_path(node, '', (!attr.value ? key : attr.value)), 
							node.getAttribute(key)); 
					}
				}

				if (node.hasAttribute('data-var'))
					templ.write_var(
						templ.expand_path(node, 'data-var'), 
						node.textContent
					);

				if (node.hasAttribute('data-when'))
					templ.write_var(
						templ.expand_path(node, 'data-when'), 
						true, 1
					);
			}

			if (node.childNodes)
				templ.parse_vars_node(node);
		} 
	},

	parse: function () {
		templ.var_dump();
		templ.parse_vars_node(document);
	},

	get: function (id) {

		return document.getElementById(id);	

	},

	editor_set: function (text) {
		var obj = templ.editor;
		if (obj.setValue) obj.setValue(text);
		else obj.value = text;
	},
	editor_get: function (text) {
		var obj = templ.editor;
		if (obj.getValue) return obj.getValue();
		else return obj.value;
	},

	var_dump: function () {
		templ.editor_set(JSON.stringify(templ.vars, null, 4));
	},

	var_in: function () {
		var vars = JSON.parse(templ.editor_get());
		templ.vars = vars;

		for (var i in templ.var_iters)
			templ.var_iters[i] = 0;
			

		templ.replace_vars(document);

		//templ.editor_set(templ.errlog);
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
					var path = templ.expand_path(node, '', (!attr.value ? key : attr.value));
					node.setAttribute(key, templ.read_var(path));
				}
			}

			if (node.hasAttribute('data-when')) {
				if (! templ.read_var(templ.expand_path(node, 'data-when')) )
				{ 
					node.style.display = 'none';
					return false;
				}
				else if (node.style.display == 'none')
					node.style.display = '';
			}

			if (node.hasAttribute('data-var')) {
				node.textContent = 
					templ.read_var(templ.expand_path(node, 'data-var'));
				stop_here = 1; // do not traverse children of inserted node
			}
		}

		if (node.childNodes && !stop_here) //stop here if 'data-var' was used
			templ.replace_vars(node);
	},
 
 	replace_vars : function (root) {
		for (var i = 0; i < root.childNodes.length; i++) { 
			var node = root.childNodes[i];
			if (node.hasAttributes()) {
				if (node.hasAttribute('data-same')) continue;
				if (node.hasAttribute('data-each')) {
					var path = templ.expand_path(node, 'data-each');
					var arr = templ.read_var(path);
					
					/* Kill marked siblings */
					var kill = node.nextSibling;
					while (kill) {
						var next = kill.nextSibling;
						if (kill.hasAttributes() && kill.hasAttribute('data-same'))
							kill.parentNode.removeChild(kill);
						kill = next;
					}
					if (is_array(arr)) { 
						/* Clone new siblings */
						var last = null;
						for (var j = 1; j < arr.length; j++) {
							templ.var_iters[path] = j;
//							alert("Setting iter for "+path+" as " + j);
							var nod = templ.safe_clone(node, last);
							last = nod;
							nod.removeAttribute('data-each');
							nod.setAttribute('data-same', path);
							templ.replace_vars_node(nod);
						}
//						alert("Setting iter for "+path+" as 0 !");
						templ.var_iters[path] = 0;
					}
				}
			}
			templ.replace_vars_node( node );
		}
	},
};
templ.setup();

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