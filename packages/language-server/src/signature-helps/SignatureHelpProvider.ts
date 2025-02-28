import { Connection, SignatureHelp, SignatureHelpParams, SignatureInformation } from 'vscode-languageserver';
import { findNodeByPosition } from '../utils/node';
import type { SyntaxNode } from 'web-tree-sitter';
import { twigFunctionsSignatureInformation } from './staticSignatureInformation';
import { Document, DocumentCache } from '../documents';

export class SignatureHelpProvider {
    constructor(
        connection: Connection,
        private readonly documentCache: DocumentCache,
    ) {
        connection.onSignatureHelp(
            this.provideSignatureHelp.bind(this),
        );
    }

    async provideSignatureHelp(
        params: SignatureHelpParams,
    ): Promise<SignatureHelp | undefined> {
        const document = this.documentCache.get(params.textDocument.uri);

        if (!document) {
            return undefined;
        }

        const cursorNode = findNodeByPosition(document.tree.rootNode, params.position);
        if (!cursorNode) return;

        const argumentsNode = cursorNode.parent;
        if (argumentsNode?.type !== 'arguments') return;

        const callExpression = argumentsNode.parent;
        if (!callExpression || callExpression.type !== 'call_expression') return;

        const callName = callExpression.childForFieldName('name')?.text;

        if (!callName) return;

        const signatureInformation = await this.getSignatureInformation(document, callName);
        if (!signatureInformation?.parameters?.length) return;

        let activeParameter = 0;

        let node: SyntaxNode | null = argumentsNode.firstChild;
        while (node) {
            if (node.text === ',') {
                activeParameter++;
            }

            if (node.equals(cursorNode)) {
                break;
            }

            node = node.nextSibling;
        }

        return {
            signatures: [signatureInformation],
            activeParameter,
        } as SignatureHelp;
    }

    async getSignatureInformation(document: Document, functionName: string): Promise<SignatureInformation | undefined> {
        const twigHardcodedSignature = twigFunctionsSignatureInformation.get(functionName);

        if (twigHardcodedSignature) return twigHardcodedSignature;

        if (functionName.includes('.')) {
            const [ importName, macroName ] = functionName.split('.');

            const importedDocument = await this.documentCache.resolveImport(document, importName);
            if (!importedDocument) return;

            await importedDocument.ensureParsed();

            const macro = importedDocument.locals.macro.find(macro => macro.name === macroName);
            if (!macro) return;

            const argsStr = macro.args
                .map(({ name, value }) => value ? `${name} = ${value}` : name)
                .join(', ');

            return {
                label: `${functionName}(${argsStr})`,
                parameters: macro.args.map(arg => ({ label: arg.name })),
            };
        }
    }
}
