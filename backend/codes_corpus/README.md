# Checked-facts corpus

These files are **not** code text. Each entry is a value Aptimizer uses, written in our own
words, with the clause and the printed page where a team member or the Phase II testing
checked it against NBC 2016 Volume 1, or, for the IS files, where Saurav Ambasta checked it
against the standard in Phase II (IS 456, IS 875 Parts 1-3, IS 13920:1993, IS 1172, IS 10262,
IS 1904). A file read from a different edition than the app's code library names that edition
in its first line (is13920_1993.md) and is cited with it. The rule in `tests/fixtures/codes_corpus/README.md`
still holds: no BIS or NBC prose is copied here.

Without a corpus the assistant correctly refused every general code question (44 of 47 NBC
questions in the Phase II S5-020 to 023 first run). With these facts it answers them from a
checked source and still refuses anything the files do not cover.

Add an entry only after the value has been read in the book, and give the page. After any
change, rebuild the index from `backend/`:

    python -m codesearch build

and commit `codes_index/` with the corpus, since the server reads the built index.
