import vscode = require('vscode');
import jsforce = require('jsforce');
import * as error from '../util/error';
import { QueryResult } from 'jsforce';
import { getAuraDefTypeFromFilename } from '../parsers/getName';
// import ReferencesDocument from './referencesDocument';
/**
 * Salesforce Content Provider class.
 * This class provides an easy way to retrieve files as a native VSCode.Uri
 */
export default class ForceCodeContentProvider
  implements vscode.TextDocumentContentProvider {
  /**
   * @param {vscode.Uri} uri file
   * @param {vscode.CancellationToken} token
   * @return {Thenable<string>} TODO: give a description
   */
  provideTextDocumentContent(uri: vscode.Uri): Thenable<string> {
    var uriParts: string[] = uri.path.split('/');
    let toolingType: string = uriParts[1];
    var bundleRelationField: string = '';
    var field: string = 'Body';
    var nameField: string = 'Name';
    var toolingName: string;
    var addtionalClauses: string = '';
    if (toolingType === 'ApexComponent' || toolingType === 'ApexPage') {
      toolingName = uriParts[2].split('.')[0];
      field = 'Markup';
    } else if (toolingType === 'AuraDefinition') {
      bundleRelationField = 'AuraDefinitionBundle.';
      nameField = 'DeveloperName';
      field = 'Source';
      toolingName = uriParts[2];
      addtionalClauses = ` AND DefType = '${getAuraDefTypeFromFilename(uriParts[2]+'/'+uriParts[3])}'`;
    } else if (toolingType === 'LightningComponent') {
      toolingType = 'LightningComponentResource';
      bundleRelationField = 'LightningComponentBundle.';
      nameField = 'DeveloperName';
      toolingName = uriParts[2];
      field = 'Source';
      addtionalClauses = ` AND FilePath = 'lwc/${uriParts[2]}/${uriParts[3]}'`;
    } else {
      toolingName = uriParts[2].split('.')[0];
    }
    
    var whereCondition: string = `${bundleRelationField}NamespacePrefix = '${
      vscode.window.forceCode.config.prefix
        ? vscode.window.forceCode.config.prefix
        : ''
    }' and ${bundleRelationField}${nameField}='${toolingName}'`;
    return new Promise<string>((resolve, reject) => {
      var query: string = `SELECT ${field} FROM ${toolingType} WHERE ${whereCondition}${addtionalClauses}`;
      vscode.window.forceCode.conn.tooling
        .query(query)
        .then((results: QueryResult) => {
          if (results && results.totalSize === 1) {
            resolve(results.records[0][field]);
          } else {
            reject('Object not found');
          }
        })
        .catch(err =>
          error.outputError(err, vscode.window.forceCode.outputChannel)
        );
    });
  }
}
