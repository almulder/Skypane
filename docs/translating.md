# Translating Skypane

Skypane 3.0 ships in English, but every word on screen already comes from a string table, so a translation is a few
new files. Nothing in the code has to change. This page is for translators and for whoever adds a language.

## The tables

| What | English table | Read by | A translation |
|---|---|---|---|
| The Manager (the setup pages) | `dashboard/manage/strings/en.js` → `window.SKYPANE_STRINGS.en` | `Kit.t(key, vars)` (kit.js) | `dashboard/manage/strings/<code>.js` → `window.SKYPANE_STRINGS["<code>"]` |
| The panels (the wall tablets) | `dashboard/layouts/v4/shared/strings/en.js` → `window.PANEL_STRINGS.en` | `T(key, vars)` (shared/strings.js) | `dashboard/layouts/v4/shared/strings/<code>.js` → `window.PANEL_STRINGS["<code>"]` |
| The help | `dashboard/manage/help-topics.js` | help.js | translated as a whole file (planned for 3.1) |

**Not in the tables yet (3.1): server-sent texts.** Some words come from the Skypane server rather than the pages:
the Overview's and Health's problem texts, the Integrations field names and hints, sign-in refusals, the house model's
room names and the activity log's details (`service/overview.py`, `health.py`, `house_settings.py`, `manager_auth.py`,
`house_model.py`, `activity_log.py`). They stay English in 3.0; moving them into tables is planned for 3.1.

`<code>` is a language code (BCP 47): `de`, `fr`, `nl`, `es`, `pt-BR`…

A translation file has the same keys as the English one and translated values. It can leave out keys: anything
missing is shown in English. Copy the English file, rename it, change the `.en =` line to the new code, and translate
the right-hand sides only.

## The keys

`page.area.thing`, written in lower camelCase with dots between, and at least two parts. Examples:
`devices.sheet.roomHint`, `panels.live.footView`, `builder.card.delete`. The first part is the page or part of the
screen (`devices`, `panels`, `builder`, `cameras`, `accounts`, `health`, `timeline`, `shell`…). Keys are never shown;
don't translate them.

## Values

- **Whole sentences.** A value is always a full sentence or label, never half of one. If a sentence needs a number or
  a name, it's a placeholder, never text added on before or after.
- **Placeholders** are `{name}`, e.g. `"Saved {name}"` or `"Camera {n} of {total}"`. Keep every placeholder, spelled
  exactly as it is. You may move it anywhere in the sentence.
- **Plurals** are objects keyed by the forms `Intl.PluralRules` gives for the language. For example, English:
  `{ "one": "{n} panel", "other": "{n} panels" }`. A language with more forms adds them (`few`, `many`…); `other` is
  always required. The count is `{n}`.
- **Plain text only.** No HTML: a value is never read as markup. Write `<`, `>` and `&` only where they really are
  part of the text.
- **Dates, times and numbers** aren't in the tables. They're formatted for the language by the browser (`Intl`),
  including 12- or 24-hour clocks.
- Keep the same tone: short, plain, friendly. Wording without "you" works best on shared wall panels.

## Who chooses the language

- **The Manager:** each login chooses its own (Your account → Language). It's stored as the login's preference
  `lang`. The Manager loads `strings/<code>.js` after English, before the first page is drawn.
- **A panel:** each panel has its own (Panels → Setup → General → Language). It's stored as the panel setting
  `language` and handed to the page as `PANEL_LANG`. The panel loads its `strings/<code>.js` after English.
- The builder's names for animations and drawings come from the panel's files. The Manager shows them under the keys
  `builder.motionName.<id>` and `builder.artName.<id>`, which a Manager translation may add. The English names stay
  when it doesn't.

- A few words the layout builder puts into a new card ("Your text", "Scene", a wheel action's label) are saved in that
  layout in the language of the Manager that made it — like anything typed on the card. Changing the language later
  doesn't change them; edit the card.

## Adding a language

1. Add `dashboard/manage/strings/<code>.js` and `dashboard/layouts/v4/shared/strings/<code>.js`.
2. Add the code to the server's lists:
   - `LANGS` in `service/manager_prefs.py` (the Manager)
   - `PANEL_LANGS` in `service/panel_settings.py` (the panels)
3. Add its name in its own language as `lang.<code>` to the English Manager table (e.g. `"lang.de": "Deutsch"`). The
   language choices list it from then on.
4. Send the files to the Skypane team (a feedback report or a pull request). The tests and the string scanners aren't
   part of the tester release: the maintainers run them (`service.test_manager_strings`, `service.test_panel_strings`,
   `service.test_language`) before a translation ships.

## For developers: keeping it that way

- New words in the Manager's JavaScript go into `dashboard/manage/strings/en.js` and are read with `K.t("key", vars)`.
- On a panel, they go into `shared/strings/en.js` and are read with `T("key", vars)`.
- The maintainers' string scanners (in the development repository, not in the tester release) find words written
  straight into the code, and the tests fail on any. A line that has words on purpose ends with `// i18n-ok`: a log line, an example value, a CSS
  value, or a value the server compares.
- Every key the code uses must be in the English table (tested).
