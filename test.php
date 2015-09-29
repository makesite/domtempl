<?php

include 'domtempl.php';

$files = glob("samples/*.json");
asort($files);
$i = 0;

foreach ($files as $file) {

	$bare = str_replace(".json", "", $file);

	print " TEST $i -- " . str_replace('samples/','', $bare) . "\n";

	$htmlfile = $bare .".html";
	$jsonfile = $bare .".json";
	$flagsfile = $bare .".flags";

	$intestfile  = $bare .".expect-in";
	$outtestfile = $bare .".expect-out";

	$data = json_decode(file_get_contents($jsonfile), true);
	$html = file_get_contents($htmlfile);
	$expected_data = json_decode(file_get_contents($intestfile), true);
	$expected_html = file_get_contents($outtestfile);
	$flags = (array)json_decode(@file_get_contents($flagsfile), true);

	# Assemble flags
	$flag = 0;
	foreach ($flags as $f) {
		if ($f == 'FRAGMENT') $flag |= DOMtempl::FRAGMENT;
		if ($f == 'PRETTIFY') $flag |= DOMtempl::PRETTIFY;
		if ($f == 'ENTITY_CODE') $flag |= DOMtempl::ENTITY_CODE;
	}
	$flag |= DOMtempl::FRAGMENT;

	# Ok, let's do the test.
	# Take the template
	$l = new DOMtempl($html, $flag);

	# Compare read values to expected values
	if ($l->vars != $expected_data) {
		print "[VARS fail]=================================================\n";
		print "GOT:\n";
		print_r ($l->vars);
		print "EXPECTED:\n";
		print_r ($expected_data);
		print "\n";
	}

	# Assign test values
	$l->vars = $data;

	# Generate final HTML
	$nhtml = $l->dump();
	$nhtml = trim($nhtml);

	# Compare generated html to expected html
	if ($nhtml != $expected_html) {
		print "[HTML fail]=================================================\n";
		print "GOT:\n";
		print $nhtml;
		print "\n";
		print "EXPECTED:\n";
		print $expected_html;
		print "\n";
	}

	$i += 1;
}

?>