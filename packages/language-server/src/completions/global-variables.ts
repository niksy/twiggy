import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';
import { SyntaxNode } from 'web-tree-sitter';
import { twigGlobalVariables } from '../common';
import { TwigVariable } from './debug-twig';
import { isEmptyEmbedded } from '../utils/node';

const commonCompletionItem: Partial<CompletionItem> = {
    kind: CompletionItemKind.Variable,
    commitCharacters: ['|', '.'],
    detail: 'global variable',
};

const completions: CompletionItem[] = twigGlobalVariables.map((item) => ({
    ...commonCompletionItem,
    ...item,
}));

export function globalVariables(cursorNode: SyntaxNode, globals: TwigVariable[]): CompletionItem[] {
    if (cursorNode.type === 'variable' || isEmptyEmbedded(cursorNode)) {
        const completionsPhp = globals.map((variable): CompletionItem => ({
            ...commonCompletionItem,
            label: variable.identifier,
        }));

        return [
            ...completions.filter(comp => !completionsPhp.find(compPhp => compPhp.label === comp.label)),
            ...completionsPhp,
        ];
    }

    return [];
}
