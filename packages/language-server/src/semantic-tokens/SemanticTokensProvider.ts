import {
    SemanticTokensParams,
    SemanticTokens,
    SemanticTokensBuilder,
    Connection,
} from 'vscode-languageserver';
import { PreOrderCursorIterator } from '../utils/node';
import { pointToPosition } from '../utils/position';
import { semanticTokensLegend } from './tokens-provider';
import { TreeCursor } from 'web-tree-sitter';
import { DocumentCache } from '../documents';

const tokenTypes = new Map<string, number>(
    semanticTokensLegend.tokenTypes.map((v, i) => [v, i]),
);

const functionTokenType = tokenTypes.get('function')!;

const resolveTokenType = (node: TreeCursor) => {
    if (
        node.nodeType === 'property' &&
        node.currentNode().parent!.nextSibling?.type === 'arguments'
    ) {
        return functionTokenType;
    }

    return tokenTypes.get(node.nodeType);
};

export class SemanticTokensProvider {
    constructor(
        private readonly connection: Connection,
        private readonly documentCache: DocumentCache,
    ) {
        this.connection.languages.semanticTokens.on(
            this.serverRequestHandler.bind(this),
        );
    }

    async serverRequestHandler(params: SemanticTokensParams) {
        const semanticTokens: SemanticTokens = { data: [] };
        const uri = params.textDocument.uri;
        const document = this.documentCache.get(uri);

        if (!document) {
            return semanticTokens;
        }

        const tokensBuilder = new SemanticTokensBuilder();
        const nodes = new PreOrderCursorIterator(document.tree.walk());

        for (const node of nodes) {
            const tokenType = resolveTokenType(node);

            if (tokenType === undefined) {
                continue;
            }

            const start = pointToPosition(node.startPosition);
            const lines = node.nodeText.split('\n');
            let lineNumber = start.line;
            let charNumber = start.character;

            for (const line of lines) {
                tokensBuilder.push(lineNumber++, charNumber, line.length, tokenType, 0);
                charNumber = 0;
            }
        }

        return tokensBuilder.build();
    }
}
