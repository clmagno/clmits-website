// Lightweight Markdown toolbar + Write/Preview toggle, reused across the
// admin module editor (reading content) and the course editor (lesson
// plan). Needs marked.js loaded globally (`marked`).
// Expects a container with:
//   a textarea matching fieldSelector (defaults to [data-field="readingContent"])
//   button[data-md-action] inside [data-md-toolbar]
//   button[data-md-tab="write"] / button[data-md-tab="preview"]
//   [data-md-preview] element to render the rendered HTML into

function mdWrapSelection(textarea, before, after) {
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    const selected = value.slice(start, end) || 'text';
    textarea.value = value.slice(0, start) + before + selected + after + value.slice(end);
    textarea.focus();
    textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
}

function mdPrefixLines(textarea, prefix) {
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = value.length;
    const block = value.slice(lineStart, lineEnd);
    const prefixed = block.length
        ? block.split('\n').map((line) => (line ? prefix + line : line)).join('\n')
        : prefix;
    textarea.value = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
    textarea.focus();
    textarea.setSelectionRange(lineStart, lineStart + prefixed.length);
}

function mdInsertCodeBlock(textarea) {
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    const selected = value.slice(start, end) || 'code here';
    const block = '```\n' + selected + '\n```';
    textarea.value = value.slice(0, start) + block + value.slice(end);
    const cursor = start + 4;
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor + selected.length);
}

function mdInsertLink(textarea) {
    const url = window.prompt('Link URL:', 'https://');
    if (!url) return;
    mdWrapSelection(textarea, '[', `](${url})`);
}

const MD_ACTIONS = {
    h2: (t) => mdPrefixLines(t, '## '),
    h3: (t) => mdPrefixLines(t, '### '),
    bold: (t) => mdWrapSelection(t, '**', '**'),
    italic: (t) => mdWrapSelection(t, '*', '*'),
    ul: (t) => mdPrefixLines(t, '- '),
    ol: (t) => mdPrefixLines(t, '1. '),
    quote: (t) => mdPrefixLines(t, '> '),
    code: (t) => mdWrapSelection(t, '`', '`'),
    codeblock: mdInsertCodeBlock,
    link: mdInsertLink
};

function initMarkdownEditor(container, fieldSelector) {
    const textarea = container.querySelector(fieldSelector || '[data-field="readingContent"]');
    const preview = container.querySelector('[data-md-preview]');
    const writeTab = container.querySelector('[data-md-tab="write"]');
    const previewTab = container.querySelector('[data-md-tab="preview"]');
    if (!textarea || !preview || !writeTab || !previewTab) return;

    container.querySelectorAll('[data-md-action]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const action = MD_ACTIONS[btn.dataset.mdAction];
            if (action) action(textarea);
        });
    });

    function activate(tab, other) {
        tab.classList.add('bg-ink', 'text-white');
        tab.classList.remove('text-gray-600');
        other.classList.remove('bg-ink', 'text-white');
        other.classList.add('text-gray-600');
    }

    writeTab.addEventListener('click', (e) => {
        e.preventDefault();
        textarea.classList.remove('hidden');
        preview.classList.add('hidden');
        activate(writeTab, previewTab);
    });

    previewTab.addEventListener('click', (e) => {
        e.preventDefault();
        preview.innerHTML = window.marked
            ? marked.parse(textarea.value.trim() || '*Nothing to preview yet.*')
            : textarea.value;
        textarea.classList.add('hidden');
        preview.classList.remove('hidden');
        activate(previewTab, writeTab);
    });
}
