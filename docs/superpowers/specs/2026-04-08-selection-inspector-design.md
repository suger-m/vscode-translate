# Selection Translator Design

## Goal

Create a minimal VS Code extension that adds a right-click command for selected
text, sends that text to a free translation API, and shows the Chinese
translation in an editor hover card anchored to the selected text.

## Scope

The current version will support:

- An editor context-menu command for selected text
- Reading the current selection from the active editor
- Translating the selection to Chinese
- Showing the translated text in a richer editor hover card next to the selection
- Hover card actions for copy, replace, and retry
- Friendly error messages for empty selections, network errors, and API limits
- An optional setting for the MyMemory contact email

The first version will not include:

- AI-backed translation
- Webview UI or side panel
- Automatic translation on every selection change
- Full HTML rendering inside the editor

## Recommended Approach

Use a standard TypeScript VS Code extension with a contributed editor context
menu command that calls the MyMemory translation API and surfaces the result
through a custom hover card built from `MarkdownString` content.

Why this approach:

- It is much closer to the in-editor popup style used by mature VS Code plugins
- It stays inside VS Code's supported editor UI model
- It allows command links such as copy, replace, and retry
- It is easier to maintain than trying to fake a floating HTML popup

## User Flow

1. Open a file in VS Code
2. Select a piece of text
3. Right-click and choose `Translate Selection to Chinese`
4. See a hover card appear next to the selected text with a loading state
5. When the request finishes, see the Chinese translation in the same hover card
6. Optionally click actions such as `Copy`, `Replace Selection`, or `Retry`

## Implementation Notes

### Project Structure

- `package.json`: extension manifest, command contribution, menus, and settings
- `src/extension.ts`: activation, translation request logic, hover provider, and actions
- `tsconfig.json`: TypeScript configuration
- `.vscode/launch.json`: `F5` debugging configuration
- `.vscode/tasks.json`: build/watch task used before launch

### Runtime Logic

The command handler will:

1. Read `vscode.window.activeTextEditor`
2. Exit with a friendly popup if there is no editor
3. Read the current selection
4. Exit with a friendly popup if the selection is empty
5. Create a temporary hover state anchored to the selected range
6. Read the selected text
7. Build a MyMemory API request with:
   - source language defaulting to `en`
   - target language fixed to `zh-CN`
   - optional `de` email setting for higher free quota
8. Parse the JSON response
9. Replace the loading state with a richer hover card that contains translation content and actions
10. Clear the hover card automatically when the selection or document changes

### UI Strategy

The visual result is built using:

- `HoverProvider` for the popup card
- `MarkdownString` sections for title, translation, original text, and actions
- trusted command links for `Copy`, `Replace Selection`, and `Retry`
- a subtle decoration to keep the translated range visually anchored

This is not a full HTML popup, but it is the closest VS Code-native approach to
the kind of in-editor card shown by polished extensions.

### Translation API Choice

Use MyMemory because it has a public translation endpoint that can be used
without an API key for small-scale free usage.

Important constraint:

- MyMemory does not accept `auto` as a source language in `langpair`
- The extension therefore uses a configurable source language and defaults to
  English (`en`)

## Error Handling

- No active editor: show `No active editor found.`
- Empty selection: show `Please select some text first.`
- API non-200 response: show the returned message when possible
- Network failure: show an inline hover error state when possible
- Quota exhausted: show a message that the free API limit may have been reached

## Testing And Debugging

- Run `npm install`
- Press `F5` to launch an Extension Development Host
- In the new window, open any file and select some text
- Right-click and run `Translate Selection to Chinese`
- Confirm a hover card appears next to the selection and updates with the translated Chinese text
- Click `Copy`, `Replace Selection`, and `Retry` to confirm the hover card actions work

## Future Extensions

- Support target language switching
- Add provider choices such as DeepL or OpenAI
- Add keyboard shortcuts for the hover actions
- Persist a small translation history
