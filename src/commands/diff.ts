import * as vscode from 'vscode';
import * as parsers from '../parsers';
import * as error from '../util/error';
import { PROVIDER } from '../providers/ContentProvider';

export default function diff(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    var uri = PROVIDER + '/';
    const toolingType: string = parsers.getToolingType(document);
    const fileName: string = parsers.getWholeFileName(document);
    var componentName: string = null;

    uri += toolingType + '/';

    if (toolingType === 'AuraDefinition' || toolingType === 'LightningComponent') {
        componentName = parsers.getComponentName(document)
        uri += componentName + '/';
    }

    uri += fileName;
    
    // vscode.window.forceCode.statusBarItem.text = 'ForceCode: Diffing';
    return vscode.window.forceCode.connect(context)
        .then(diffFile)
        .catch(err => error.outputError({ message: err.toString() }, vscode.window.forceCode.outputChannel));
    // .then(finished)
    // =======================================================================================================================================
    // =======================================================================================================================================
    function diffFile() {
        var command: Thenable<{}> = vscode.commands.executeCommand('vscode.diff', buildSalesforceUriFromLocalUri(document.uri), document.uri, `${fileName} (REMOTE) <~> ${fileName} (LOCAL)`);
        return command;
    }

    function buildSalesforceUriFromLocalUri(foo: vscode.Uri): vscode.Uri {
        var sfuri: vscode.Uri = vscode.Uri.parse(`${uri}?${Date.now()}`);
        return sfuri;
    }
    // =======================================================================================================================================

    // =======================================================================================================================================

}



