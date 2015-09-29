from domtempl import DOMtempl

###
import glob
import re
import json
from pprint import pprint

files = sorted(glob.glob("samples/*.json"))
i = 0

for file in files:

	bare = file.replace(".json", "")

	print " TEST %d -- %s " % (i, bare.replace('samples/',''))


	htmlfile = "%s.html" % bare
	jsonfile = "%s.json" % bare

	intestfile = "%s.expect-in" % bare
	outtestfile = "%s.expect-out" % bare

	with open (jsonfile, "r") as f:
		data = json.load(f)

	with open (htmlfile, "r") as f:
		html = f.read()

	with open (intestfile, "r") as f:
		expected_data = json.load(f);

	with open (outtestfile, "r") as f:
		expected_html = f.read()

	# Ok, let's do the test.
	# Take the template
	l = DOMtempl(html, DOMtempl.FRAGMENT)

	# Compare read values to expected values
	if (l.vars != expected_data):
		print "[VARS fail]================================================="
		print "GOT:"
		pprint(l.vars)
		print "EXPECTED:"
		print expected_data

	# Assign test values
	l.vars = data

	# Generate final HTML
	nhtml = l.dump()

	# Compare generated html to expected html
	if (nhtml != expected_html):
		print "[HTML fail]================================================="
		print "GOT:"
		print nhtml
		print "EXPECTED:"
		print expected_html

	#print "NHTML IS: " + nhtml
	#print "\n\n"

	i += 1
