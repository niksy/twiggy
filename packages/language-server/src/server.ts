import {
    ClientCapabilities,
    Connection,
    InitializeParams,
    ServerCapabilities,
    TextDocuments,
    WorkspaceFolder,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { validateTwigDocument } from './diagnostics';
import { DocumentCache } from './documents';
import { HoverProvider } from './hovers/HoverProvider';
import { CompletionProvider } from './completions/CompletionProvider';
import { SignatureHelpProvider } from './signature-helps/SignatureHelpProvider';
import { semanticTokensLegend } from './semantic-tokens/tokens-provider';
import { SemanticTokensProvider } from './semantic-tokens/SemanticTokensProvider';
import { ConfigurationManager } from './configuration/ConfigurationManager';
import { DefinitionProvider } from './definitions';
import { SymbolProvider } from './symbols/SymbolProvider';
import {
    Command,
    ExecuteCommandProvider,
} from './commands/ExecuteCommandProvider';
import { initializeParser } from './utils/parser';
import { BracketSpacesInsertionProvider } from './autoInsertions/BracketSpacesInsertionProvider';
import { InlayHintProvider } from './inlayHints/InlayHintProvider';

export class Server {
    readonly documents = new TextDocuments(TextDocument);
    documentCache!: DocumentCache;
    workspaceFolder!: WorkspaceFolder;
    clientCapabilities!: ClientCapabilities;

    definitionProvider!: DefinitionProvider;
    completionProvider!: CompletionProvider;
    bracketSpacesInsertionProvider!: BracketSpacesInsertionProvider;
    inlayHintProvider!: InlayHintProvider;

    constructor(connection: Connection) {
        connection.onInitialize(async (initializeParams: InitializeParams) => {
            this.workspaceFolder = initializeParams.workspaceFolders![0];
            this.clientCapabilities = initializeParams.capabilities;

            const documentCache = new DocumentCache(this.workspaceFolder);
            this.documentCache = documentCache;

            await initializeParser();

            new SemanticTokensProvider(connection, documentCache);
            new SymbolProvider(connection, documentCache);
            new HoverProvider(connection, documentCache);
            new SignatureHelpProvider(connection, documentCache);
            this.definitionProvider = new DefinitionProvider(connection, documentCache);
            this.completionProvider = new CompletionProvider(
                connection,
                documentCache,
                this.workspaceFolder,
            );
            this.inlayHintProvider = new InlayHintProvider(connection, documentCache);
            new ExecuteCommandProvider(connection, documentCache);
            this.bracketSpacesInsertionProvider = new BracketSpacesInsertionProvider(
                connection,
                this.documents,
            );

            const capabilities: ServerCapabilities = {
                hoverProvider: true,
                definitionProvider: true,
                documentSymbolProvider: true,
                completionProvider: {
                    resolveProvider: true,
                    triggerCharacters: ['"', "'", '|', '.', '{'],
                },
                signatureHelpProvider: {
                    triggerCharacters: ['(', ','],
                },
                semanticTokensProvider: {
                    legend: semanticTokensLegend,
                    full: true,
                },
                inlayHintProvider: true,
                executeCommandProvider: {
                    commands: [
                        `${Command.IsInsideHtmlRegion}(${this.workspaceFolder.uri})`,
                    ],
                },
            };

            return {
                capabilities,
            };
        });

        connection.onInitialized(async () => {
            if (this.clientCapabilities.workspace?.didChangeConfiguration) {
                new ConfigurationManager(
                    connection,
                    this.inlayHintProvider,
                    this.bracketSpacesInsertionProvider,
                    this.completionProvider,
                    this.documentCache,
                );
            }
        });

        this.documents.onDidChangeContent(async ({ document }) => {
            const doc = this.documentCache.updateText(document.uri, document.getText());
            await validateTwigDocument(connection, doc);
        });
        this.documents.listen(connection);
    }
}
