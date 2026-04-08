# Selection Translator

A VS Code extension that translates the current text selection to Chinese.

## Features

- Right-click selected text and run `Translate Selection to Chinese`
- Uses the free MyMemory translation API
- Shows the result in an editor hover card
- Includes actions to copy, retry, or replace the current selection

## Settings

- `selectionTranslator.sourceLanguage`: source language code, default `en`
- `selectionTranslator.contactEmail`: optional contact email for MyMemory quota

## Development

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch the extension development host.
