from xml.dom.minidom import parse, parseString, Node
import re

def isset(dict, key):
	return key in dict

def is_array(item):
	if isinstance(item, basestring):
		return False
	return True if hasattr(item, '__iter__') else False

class DOMtempl(object):

	FRAGMENT	= 0x00000001;
	PRETTIFY	= 0x00000002;

	def __init__(self, input, flags = 0):
		self.vars = { }
		self.var_iters = { }

		if (flags & self.FRAGMENT):
			self._document = parseString(input)
		else:
			self._document = parse(input)

		self.parse()

	def error(self, str):
		print "Error:" + str

	def read_var(self, path):

		if (path[:1] == '/'): path = path[1:];
		walk = re.split("(\.|\/)", path) #, -1, PREG_SPLIT_DELIM_CAPTURE);
		
		cpath = '/';
		ptr = self.vars;
		last = walk[ len(walk) - 1 ];
		
		for i in xrange(0, len(walk) - 2, 2):		
			step = walk[i];
			mod = walk[i+1];
			cpath += step;

			if (not(isset(ptr, step))):
				self.error('undefined array "' + step + '" of path ' + path);
				return None;

			ptr = ptr[step];

			if (mod == '/'):
				n = self.var_iters[cpath];
				print "Iterator of `%s` is %d" % (cpath, n) 
				try:
					ptr = ptr[n];
				except:
				#if (not(isset(ptr, n))):
					self.error(('cant iterate through "%d"' % n) + ' of path ' + path);
					return None; 

				if (last == '*' and i == len(walk) - 3): return n; # Hack -- iterator itself
				if (last == '' and i == len(walk) - 3): break;

			cpath += mod;

		if (last == ''):
			return ptr;
		if (not(isset(ptr, last))):
			self.error('undefined variable "'+last+'" of path "' + path + '"');
			return None;
		return ptr[ last ];

	def write_var(self, path, val, no_overwrite = False):

		if (path[:1] == '/'): path = path[1:];
		walk = re.split("(\.|\/)", path) #, -1, PREG_SPLIT_DELIM_CAPTURE);

		cpath = '/';
		ptr = self.vars;
		last = walk[ len(walk) - 1 ];

		for i in xrange(0, len(walk) - 2, 2):
			step = walk[i];
			mod = walk[i+1];
			cpath += step;
			if (mod == '/'):
				n = 0;
				if (not(isset(ptr, step)) or ptr[step] == True):
					ptr[step] = { };
					self.var_iters[cpath] = 0;
				else:
					n = self.var_iters[cpath];
				ptr = ptr[step];
				if (last == '' and i == len(walk) - 3): break;
				if (not(isset(ptr, n))):
					ptr[n] = { };
				ptr = ptr[n];

			if (mod == '.'):
				if (not(isset(ptr, step)) or ptr[step] == True):
					ptr[step] = { };
				ptr = ptr[step];
			cpath += mod;

		if (last == ''):
			#print ptr
			if isinstance(ptr, dict):
				ptr[ len(ptr) ] = val;
			else:
				x = []
			#x[0] = 1
				x.append ( 1 )
			#ptr[ len(ptr) ] = val;
				ptr.append( val );
			return;

		if (no_overwrite and isset(ptr, last)): return;
		ptr[ last ] = val;

	def textContent(self, node):
	    if node.nodeType in (node.TEXT_NODE, node.CDATA_SECTION_NODE):
	        return node.nodeValue
	    else:
	        return ''.join(self.textContent(n) for n in node.childNodes)

	def expand_path(self, node, base, path = None):
		if (path is None): path = node.getAttribute(base)

		top = node.parentNode
		while path[0:1] != '/':
			top_path = '';
			if (not top): path = '/' + path; break;
			if (top.nodeType is not Node.ELEMENT_NODE):
				top = top.parentNode 
				continue;
			if (top.hasAttribute('data-from')):
				top_path = top.getAttribute('data-from') + '.';
			elif (top.hasAttribute('data-each')):
				top_path = top.getAttribute('data-each') + '/';
			elif (top.hasAttribute('data-same')):
				top_path = top.getAttribute('data-same') + '/';
			elif (top.hasAttribute('data-when')):
				top_path = top.getAttribute('data-when') + '.';
			path = top_path + path;

			top = top.parentNode
		return path

	def parse_vars_node(self, root):
		for node in root.childNodes:

			if (node.nodeType is Node.ELEMENT_NODE and node.hasAttributes()):

				if node.hasAttribute('data-each'):
					 self.var_iters[ self.expand_path(node, 'data-each') ] = 0

				if node.hasAttribute('data-same'):
					self.var_iters[ self.expand_path(node, 'data-same') ] += 1 

				#for attr in node.attributes:
				#	print attr
				for i in xrange(0, node.attributes.length):
					attr = node.attributes.item(i)
					if ('data-attr-' in attr.name):

						key = attr.name[len('data-attr'):]

						self.write_var(
							'',#self.expand_path(node, '', (not(attr.value) ? key : attr.value)),
							node.getAttribute(key)
						)

				if node.hasAttribute('data-var'):
					self.write_var(
						self.expand_path(node, 'data-var'),
						self.textContent(node)
					)

				if node.hasAttribute('data-when'):
					self.write_var(
						self.expand_path(node, 'data-when'),
						True, 1
					)

			if node.childNodes:
					self.parse_vars_node(node)


	def replace_vars_node(self, node, clean):
		stop_here = 0; #hack, for speed

		if (node.attributes is None):
			return

		if (node.nodeType is Node.ELEMENT_NODE):

			for j in xrange(0, node.attributes.length):
			#for (var j = 0; j < node.attributes.length; j++):
				attr = node.attributes.item(j);#[j];
				if ('data-attr-' in attr.name):
					key = attr.name[len('data-attr-'):]
					path = self.expand_path(node, '', (key if not(attr.value) else attr.value));
					val = self.read_var(path);
					if (val != False):
						node.setAttribute(key, val);
					clean.append( attr.name );						

			if (node.hasAttribute('data-var')):
				print "\nReplacing data-var for "
				print node
				clean.append('data-var')
				self.node_set_innerHTML(node,
					self.read_var(self.expand_path(node, 'data-var'))
				);
								
				print "Inner html is now:" + node.toxml()
				print "\n"
				stop_here = 1; # do not traverse children of inserted node

		if (node.childNodes and not(stop_here)): # stop here if 'data-var' was used
			self.replace_vars(node);
		for attr in clean:
			node.removeAttribute(attr);
			

 	def replace_vars(self, root):
 		for i in xrange(0, root.childNodes.length):
 			if i >= root.childNodes.length: # because range/xrange doesn't change :((
 				break
 
			node = root.childNodes[i];
			clean = []

			if (node.nodeType is Node.ELEMENT_NODE and node.hasAttributes()):
				if node.hasAttribute('data-when'):
					if not( self.read_var(self.expand_path(node, 'data-when')) ):
						i -= self.safe_remove(node);
						continue;
					clean.append( 'data-when' );

				if (node.hasAttribute('data-same')): 
					clean.append( 'data-same' );
					continue;
				if (node.hasAttribute('data-each')):
					clean.append( 'data-each' );				
					path = self.expand_path(node, 'data-each');
					arr = self.read_var(path);

					# Kill marked siblings
					kill = node.nextSibling;
					while (kill):
						next = kill.nextSibling;
						if (kill.nodeType is Node.ELEMENT_NODE and kill.hasAttribute('data-same')):
							kill.parentNode.removeChild(kill);
						kill = next;

					print "Cloning time with"
					print arr

					if (is_array(arr) and len(arr)):
						# Clone new siblings
						last = None;
						for j in xrange(1, len(arr)):
							print "Doing clone #%d, setting var iter of /%s" % (j, path)
							self.var_iters[path] = j;
							nod = self.safe_clone(node, last);
							last = nod;
							nod.removeAttribute('data-each');
							nod.setAttribute('data-same', path);
							self.replace_vars_node(nod, ['data-same']);
						self.var_iters[path] = 0;

					print "CLONE COMPLETE"

			self.replace_vars_node( node , clean );


	def reflow(self):
		# Reset iteration counters
		if (self.var_iters):
			for i in self.var_iters:
				self.var_iters[i] = 0;

		# Reflow all variables
		self.replace_vars(self._document);

	def parse(self):
		self.parse_vars_node(self._document)

	def assign(self, path, var):
		self.write_var(path, var)

	def dump(self):
		self.reflow()
		return self._document.toxml()

	def out(self):
		print self.dump()

	def safe_remove(self, node):
		ident = node.previousSibling;
		print "When removing "
		print node
		print "it's ident is"
		print ident
		print "and ws is "
		print ident.isWhitespaceInElementContent
		r = 0;
		if (ident is not None
			and ident.nodeType == Node.TEXT_NODE 
			and not ident.wholeText.strip()
			#and ident.isWhitespaceInElementContent
		):
			ident.parentNode.removeChild(ident);
			r = 1;

		node.parentNode.removeChild(node)
		return r

	def safe_clone(self, elem, after = None):
		if after == None: after = elem;
		if (elem.cloneNode):

			orig = elem.previousSibling;
			ident = None;
			if (orig is not None 
			and orig.nodeType == Node.TEXT_NODE 
			and not orig.wholeText.strip() 
			#and orig.isWhitespaceInElementContent
			):
				ident = orig.cloneNode(False);

			cln = elem.cloneNode(True);
			o = after.nextSibling; 
			if (o):
				if (ident): elem.parentNode.insertBefore(ident, o);
				elem.parentNode.insertBefore(cln, o);
			else:
				if (ident): elem.parentNode.appendChild(ident);
				elem.parentNode.appendChild(cln);
			return cln;
		return None;

	def node_set_innerHTML(self, node, value):

		for x in xrange(node.childNodes.length - 1, -1, -1):
			node.removeChild(node.childNodes.item(x));

		if isinstance(value, int):
			value = "%d" % value

		if not ("<" in value or ">" in value or "&" in value):
			txt = node.ownerDocument.createTextNode(value)
   			node.appendChild(txt)
			return;

		if (value):
			f = parseString(value)
			_import = f

			if (not f):
				f = parseString( \
				"<meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\" />" \
				+ '<htmlfragment>' + value + '</htmlfragment>');
				#f.encoding = 'UTF-8';
				_import = f.getElementsByTagName('htmlfragment').item(0);

			if (f):
				for child in _import.childNodes:
					importedNode = node.ownerDocument.importNode(child, True);
					node.appendChild(importedNode);
