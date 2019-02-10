import * as vscode from 'vscode';
import { ForceService } from './services';
import ForceCodeContentProvider from './providers/ContentProvider';
import ForceCodeLogProvider from './providers/LogProvider';
import ApexCompletionProvider from './providers/ApexCompletion';
import { editorUpdateApexCoverageDecorator, documentUpdateApexCoverageDecorator } from './decorators/testCoverageDecorator';
import * as commands from './commands';
import * as parsers from './parsers';
import * as path from 'path';
import SoqlCompletionProvider from './providers/SoqlCompletion';

export function activate(context: vscode.ExtensionContext): any {
    vscode.window.forceCode = new ForceService();

    console.log(require.resolve('jsforce', {paths: [__dirname, '..']}));

    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('forcecode', new ForceCodeContentProvider()));
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('sflog', new ForceCodeLogProvider()));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.documentMethod', () => {
        commands.documentMethod(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.showMenu', () => {
        commands.showMenu(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.setActiveOrg', () => {
        commands.setActive();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.executeAnonymous', () => {
        commands.executeAnonymous(vscode.window.activeTextEditor.document, context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.soql', () => {
        commands.soql(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.getLog', () => {
        commands.getLog(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.open', (selectedResource?: vscode.Uri) => {
        if (selectedResource.path) {
            vscode.workspace.openTextDocument(selectedResource).then(doc => commands.compile(doc, context));
        } else {
            commands.compile(vscode.window.activeTextEditor.document, context);
        }
        commands.open(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.retrievePackage', () => {
        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document) {
            commands.retrieve(context, vscode.window.activeTextEditor.document);
        } else {
            commands.retrieve(context);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.staticResource', () => {
        commands.staticResource(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.apexTest', () => {
        commands.apexTest(vscode.window.activeTextEditor.document, context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.refresh', () => {
        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document) {
            commands.retrieve(context, vscode.window.activeTextEditor.document);
        } else {
            commands.retrieve(context);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.compile', (selectedResource?: vscode.Uri) => {
        if (selectedResource && selectedResource.path) {
            vscode.workspace.openTextDocument(selectedResource)
                .then(doc => commands.compile(doc, context));
        } else {
            commands.compile(vscode.window.activeTextEditor.document, context);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.diff', () => {
        commands.diff(vscode.window.activeTextEditor.document, context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.testCoverage', () => {
        commands.testCoverage();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ForceCode.describe', () => {
        commands.codeCompletionRefresh(context);
    }))

    // AutoCompile Feature
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((textDocument: vscode.TextDocument) => {
        const toolingType: string = parsers.getToolingType(textDocument);
        if (toolingType && vscode.window.forceCode.config && vscode.window.forceCode.config.autoCompile === true) {
            commands.compile(textDocument, context);
        }
        var isResource: RegExpMatchArray = textDocument.fileName.match(/resource\-bundles.*\.resource.*$/); // We are in a resource-bundles folder, bundle and deploy the staticResource
        if (isResource.index && vscode.window.forceCode.config && vscode.window.forceCode.config.autoCompile === true) {
            commands.staticResourceDeployFromFile(textDocument, context);
        }
    }));

    // Code Completion Provider
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('apex', new ApexCompletionProvider(), '.', '@'));
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('soql', new SoqlCompletionProvider(), '.', ' '));

    // Text Coverage Decorators
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editorUpdateApexCoverageDecorator));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(documentUpdateApexCoverageDecorator));

    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        context.subscriptions.push(vscode.workspace.createFileSystemWatcher(path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'force.json')).onDidChange(uri => { 
            vscode.window.forceCode.connect(context)
        }));
    }


    // // Peek Provider Setup
    // const peekProvider: any = new commands.PeekFileDefinitionProvider();
    // const definitionProvider: any = vscode.languages.registerDefinitionProvider(constants.PEEK_FILTER, peekProvider);
    // context.subscriptions.push(definitionProvider);
}
