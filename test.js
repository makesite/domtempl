var jsdom = require("jsdom").jsdom;
var DOMtempl = require("./domtempl");
var glob = require("glob");
var fs = require("fs");
var console = require("console");

var files = glob.sync("samples/*.json")
var i = 0

// because there's no better way in JS (?)
equals = function (self, array) {
    if (self.length != array.length) return false;
    for (var i = 0, l=self.length; i < l; i++) {
        if (self[i] instanceof Array && array[i] instanceof Array) {
            if (!equals(self[i], array[i])) return false;       
        }
        else if (self[i] != array[i])
            return false;
    }
    return true;
}

var fails = 0;

for (var j in files) {
	var file = files[j];

	bare = file.replace(".json", "")

	console.log( " TEST " + i + " -- " + bare.replace('samples/','') )

	htmlfile = bare + ".html"
	jsonfile = bare + ".json"

	intestfile  = bare + ".expect-in"
	outtestfile = bare + ".expect-out"

	var data = JSON.parse(fs.readFileSync(jsonfile))
	var html = fs.readFileSync(htmlfile, {"encoding":"UTF-8"})

	var expected_data = JSON.parse(fs.readFileSync(intestfile))
	var expected_html = fs.readFileSync(outtestfile, {"encoding":"UTF-8"})

	// Ok, let's do the test.
	// Take the template
	l = DOMtempl(jsdom(html))

	// Compare read values to expected values
	if (!equals(l.vars, expected_data)) {
		console.log( "[VARS fail]=================================================" );
		console.log( "GOT:" );
		console.log( l.vars );
		console.log( "EXPECTED:" );
		console.log( expected_data );
		fails++;
	}

	// Assign test values
	l.vars = data

	// Generate final HTML
	nhtml = l.dump()

	// Compare generated html to expected html
	if (nhtml != expected_html) {
		console.log( "[HTML fail]=================================================" );
		console.log( "GOT:" );
		console.log( nhtml );
		console.log( "EXPECTED:" );
		console.log( expected_html );
		fails++;
	}

	i += 1

}
console.log("Failed: " + fails + " tests");
