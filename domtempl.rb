require 'nokogiri'
require 'open-uri'

class DOMtempl

	FRAGMENT	= 0x00000001;
	PRETTIFY	= 0x00000002;

	attr_accessor :vars

	def initialize(input, flags = 0)
		@vars = { }
		@var_iters = { }

		if (flags & FRAGMENT)
			@_document = Nokogiri::XML::DocumentFragment.parse(input)
		else
			@_document = Nokogiri::HTML(open(input))
		end

		parse()
	end

	def error( str)
		puts "Error:" + str
	end

	def read_var(path)

		if (path[0] == '/') then path = path[1..-1] end
		walk = path.split(/(\.|\/)/, -1) #, -1, PREG_SPLIT_DELIM_CAPTURE);

#puts "let's r-walk [" + path + "] {"
#puts walk
#puts " } "
#puts @vars

		cpath = '/'
		ptr = @vars
		last = walk[ walk.length - 1 ]

		(0..walk.length-2).step(2).each do |i|

			step = walk[i]
			mod = walk[i+1]
			cpath += step

			if (ptr[step].nil?)
				error('undefined array "' + step + '" of path ' + path)
				return nil;
			end

			ptr = ptr[step];

			if (mod == '/')
				n = @var_iters[cpath];
				#puts sprintf("Iterator of `%s` is %d", cpath, n)

				if (ptr[n].nil?)
					error(('cant iterate through "%d"' % n) + ' of path ' + path);
					return nil;
				end 

				ptr = ptr[n];

				if (last == '*' and i == walk.length - 3) then return n; end # Hack -- iterator itself
				if (last == '' and i == walk.length - 3) then break; end
			end

			cpath += mod;
		end

		if (last == '')
			return ptr;
		end
		if (ptr[last].nil?)
			error('undefined variable "'+last+'" of path "' + path + '"');
			return nil;
		end
		return ptr[ last ];
	end

	def write_var(path, val, no_overwrite = false)

		if (path[0] == '/') then path = path[1..path.length]; end
		walk = path.split(/(\.|\/)/, -1); #, -1, PREG_SPLIT_DELIM_CAPTURE);

		cpath = '/';
		ptr = @vars;
		last = walk[ walk.length - 1 ];

#puts "Lets w-walk [ " + path + "] { "
#puts walk
#puts "}"

		(0..walk.length-2).step(2).each do |i|
			step = walk[i]
			mod = walk[i+1]
			cpath += step
			if (mod == '/')
				n = 0;
				if (ptr[step].nil? or ptr[step] == true)
					ptr[step] = [ ]
					@var_iters[cpath] = 0
				else
					n = @var_iters[cpath]
				end
				ptr = ptr[step]
				if (last == '' and i == walk.length - 3) then break; end
				if (ptr[n].nil?)
					ptr[n] = { }
				end
				ptr = ptr[n]
			end

			if (mod == '.')
				if (ptr[step].nil? or ptr[step] == true)
					ptr[step] = { }
				end
				ptr = ptr[step]
			end
			cpath += mod
		end

		if (last == '')
			#print ptr
			#if isinstance(ptr, dict)
			#	ptr[ ptr.length ] = val;
			#else
				ptr.push( val );
			#end
			return;
		end

		if (no_overwrite and not(ptr[last].nil?)) then return; end
#		puts "Setting [" + last + "]"
#		puts "in" 
#		puts ptr
		ptr[ last ] = val;
	end

	def expand_path(node, base, path = nil)
		if (path == nil) then path = node.get_attribute(base) end

		top = node.parent
		while path[0] != '/'
			top_path = '';
			if (!top) then path = '/' + path; break; end
			if (top.type != Nokogiri::XML::Node::ELEMENT_NODE)
				top = top.parent
				next;
			end
			if (top.has_attribute?('data-from'))
				top_path = top.get_attribute('data-from') + '.';
			elsif (top.has_attribute?('data-each'))
				top_path = top.get_attribute('data-each') + '/';
			elsif (top.has_attribute?('data-same'))
				top_path = top.get_attribute('data-same') + '/';
			elsif (top.has_attribute?('data-when'))
				top_path = top.get_attribute('data-when') + '.';
			end

			path = top_path + path;
			top = top.parent
		end
		return path
	end

	def parse_vars_node(root)
		for node in root.children

			if (node.type == Nokogiri::XML::Node::ELEMENT_NODE and node.attributes())

				if node.has_attribute?('data-each')
					 @var_iters[ expand_path(node, 'data-each') ] = 0
				end

				if node.has_attribute?('data-same')
					@var_iters[ expand_path(node, 'data-same') ] += 1
				end

				#for attr in node.get_attributes:
				#	print attr
				for i in 0..node.attributes.length-1
					attr = node.attribute_nodes[i]
					if (attr.name.include?('data-attr-'))

						key = attr.name['data-attr'.length..-1]

						write_var(
							expand_path(node, '', not(attr.value) ? key : attr.value),
							node.get_attribute(key).to_s
						)
					end
				end

				if node.has_attribute?('data-var')
					write_var(
						expand_path(node, 'data-var'),
						node.inner_text()
					)
				end

				if node.has_attribute?('data-when')
					write_var(
						expand_path(node, 'data-when'),
						true, 1
					)
				end
			end
			if node.children
				parse_vars_node(node)
			end
		end
	end

	def replace_vars_node(node, clean)
		stop_here = false; #hack, for speed

		if (node.attributes)

			if (node.type == Nokogiri::XML::Node::ELEMENT_NODE)

				j = -1
				#for (j = 0; j < node.get_attributes.length; j++):
				while j < node.attributes.length - 1
					j += 1
					attr = node.attribute_nodes[j];
					if (attr.name.include?('data-attr-'))
						key = attr.name['data-attr-'.length..-1]
						path = expand_path(node, '', (not(attr.value) ? key : attr.value));
						val = read_var(path);
						if (val != false)
							node.set_attribute(key, val);
						end
						clean.push( attr.name );
					end
				end

				if (node.has_attribute?('data-var'))
					#print "\nReplacing data-var for `"
					#print node
					#puts "` using the path `"  + expand_path(node, 'data-var') + "`"
					clean.push( 'data-var' )
					node.inner_html = 
						read_var(expand_path(node, 'data-var'))
					;

					#print "Inner html is now:" + node.toxml()
					#print "\n"
					stop_here = true; # do not traverse children of inserted node
				end
			end
		end

		if (node.children and not(stop_here)) # stop here if 'data-var' was used
			replace_vars(node);
		end
		for attr in clean
			node.remove_attribute(attr);
		end
	end

	def replace_vars(root)
		for i in 0..root.children.length-1
			if i >= root.children.length # because range/xrange doesn't change :((
				break
			end

			node = root.children[i];
			clean = []

			if (node.type == Nokogiri::XML::Node::ELEMENT_NODE and node.attributes())
				if node.has_attribute?('data-when')
					if not( read_var(expand_path(node, 'data-when')) )
						i -= safe_remove(node);
						next;
					end
					clean.push( 'data-when' );
				end

				if (node.has_attribute?('data-same'))
					clean.push( 'data-same' );
					next;
				end
				if (node.has_attribute?('data-each'))
					clean.push( 'data-each' );
					path = expand_path(node, 'data-each');
					arr = read_var(path);

					# Kill marked siblings
					kill = node.next_sibling;
					while (kill)
						_next = kill.next_sibling;
						if (kill.type == Nokogiri::XML::Node::ELEMENT_NODE and kill.has_attribute('data-same'))
							safe_remove(kill);
						end
						kill = _next;
					end

					#print "Cloning time with"
					#print arr

					if (arr.length)
						# Clone new siblings
						last = nil;
						(1..arr.length-1).each do |j|
							#puts sprintf("Doing clone #%d, setting var iter of /%s", j, path);
							@var_iters[path] = j;
							nod = safe_clone(node, last);
							last = nod;
							nod.remove_attribute('data-each');
							nod.set_attribute('data-same', path);
							replace_vars_node(nod, ['data-same']);
						end
						@var_iters[path] = 0;
					end

					#print "CLONE COMPLETE"
				end
			replace_vars_node( node, clean );
			end
		end
	end

	def reflow()
		# Reset iteration counters
		if (@var_iters)
			for i in @var_iters.keys
				@var_iters[i] = 0;
			end
		end

		# Reflow all variables
		replace_vars(@_document);
	end

	def parse()
		parse_vars_node(@_document)
	end

	def assign(path, var)
		write_var(path, var)
	end

	def dump()
		reflow()
		return @_document.to_html()
	end

	def out()
		print dump()
	end

	def dumpXML()
		reflow()
		return @_document.toxml()
	end

	def outXML()
		print dumpXML()
	end

	def safe_remove(node)
		ident = node.previous_sibling;
		#print "and ws is "
		#print ident.isWhitespaceInElementContent
		r = 0;
		if (ident != nil \
			and ident.type == Nokogiri::XML::Node::TEXT_NODE \
			and ident.inner_text.strip() == ''
			#and ident.isWhitespaceInElementContent
		)
			ident.remove();
			r = 1;
		end

		node.remove()
		return r
	end

	def safe_clone(elem, after = nil)
		if after == nil then after = elem; end
		
		#print "Must clone "
		#puts elem
		#print " after "
		#puts after
		
		#if (elem.cloneNode)

			orig = elem.previous_sibling;
			ident = nil;
			if (orig != nil \
			and orig.type == Nokogiri::XML::Node::TEXT_NODE \
			and orig.inner_text.strip() == '' 
			#and orig.isWhitespaceInElementContent
			)
				ident = orig.clone();
				#print "Found ident ("
				#print ident.inner_text.length
				#print ident
				#print ")"
				#puts ""
			end

			cln = elem.clone();

			# Note: because Nokogiri has different DOM-append methods,
			# we do not need appendChild/insertBefore wraps
			after.after(cln);
			if (ident) then cln.before(ident); end

			return cln;
		#end
		#return nil;
	end

end

