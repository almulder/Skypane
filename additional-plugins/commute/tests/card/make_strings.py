"""Writes strings.js (the card's words for the browser check) from the plugin's strings/en.json. Run: python -B make_strings.py"""
import json, pathlib
here = pathlib.Path(__file__).resolve().parent
words = json.loads((here.parents[1] / "source" / "strings" / "en.json").read_text(encoding="utf-8"))
(here / "strings.js").write_text("var WORDS = " + json.dumps(words) + ";\n", encoding="utf-8")
