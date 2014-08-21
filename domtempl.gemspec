Gem::Specification.new do |s|
  s.name        = 'domtempl'
  s.version     = '0.0.2'
  s.licenses    = ['BSD']
  s.summary     = "DOM-based templating system."
  s.description = "Ruby implementation of DOMtempl."
  s.authors     = ["driedfruit"]
  s.email       = 'driedfruit@mindloop.net'
  s.add_runtime_dependency "nokogiri"
  s.files       = ["lib/domtempl.rb"]
  s.homepage    = 'https://makesite.github.io/domtempl'
end