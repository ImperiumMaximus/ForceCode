import * as vscode from 'vscode';
import * as error from '../util/error';
import Logger, * as logger from '../services/logger';
import { configuration } from '../services';
import * as jsforce from 'jsforce';
import { getLog } from '.';
import { runInThisContext } from 'vm';
import { resolve } from 'path';
import { format } from 'url';

export interface IExecuteAnonymousService {
  userId?: string;
  queryString?: string;
  connection?: jsforce.Connection;
  apexBody?: string;
  traceFlagId?: string;
  logId?: string;
};

export default function executeAnonymous(document: vscode.TextDocument, context: vscode.ExtensionContext): any {
  let apexBody: string = document.getText();
  let loggerSvc = new Logger(context);
  // vscode.window.forceCode = vscode.window.forceCode;
  // vscode.window.forceCode.outputChannel = ;
  return vscode.window.forceCode.connect()
    .then(svc => loggerSvc.createDebugLevel(null))
    .then(loggerSvc.enableLogging)
    .then(any => invokeExecuteAnonymous(apexBody))
    .then(res => runDiagnostics(res, document))
    .then(showResult)
    .catch(err => error.outputError(err, vscode.window.forceCode.outputChannel));

  // =========================================================================================================
  // =====================       USING SOAP API      =========================================================
  // =========================================================================================================
  function invokeExecuteAnonymous(text: string): Promise<jsforce.ExecuteAnonymousResponse> {
    vscode.window.forceCode.statusBarItem.text = 'ForceCode: $(pulse) Executing $(pulse)';
    vscode.window.forceCode.conn.debuggingHeader = vscode.window.forceCode.conn.debuggingHeader ? vscode.window.forceCode.conn.debuggingHeader : {};
    vscode.window.forceCode.conn.debuggingHeader['@xmlns'] = 'http://soap.sforce.com/2006/08/apex';
    vscode.window.forceCode.conn.debuggingHeader['categories'] = [
      {
          'category': 'Apex_code',
          'level': 'DEBUG',
      }, {
          'category': 'Apex_profiling',
          'level': 'DEBUG',
      }, {
          'category': 'Callout',
          'level': 'DEBUG',
      }, {
          'category': 'Db',
          'level': 'DEBUG',
      }, {
          'category': 'System',
          'level': 'DEBUG',
      }, {
          'category': 'Validation',
          'level': 'DEBUG',
      }, {
          'category': 'Visualforce',
          'level': 'DEBUG',
      }, {
          'category': 'Workflow',
          'level': 'DEBUG',
      },
    ];
    

    return new Promise((resolve, reject) => { 
      vscode.window.forceCode.conn.tooling.executeAnonymous(text).then(res => {
      if (res && res.compiled) {
          loggerSvc.getLastLog()
          .then(loggerSvc.getLog)
          .then(logBody => { 
            resolve(
              { 
                body: { 
                  result: res 
                }, 
                header: { 
                  debugLog: logBody 
                } 
              }) 
            })
          } 
        });
      });
}


function runDiagnostics(res: jsforce.ExecuteAnonymousResponse, _document: vscode.TextDocument) {
    // Create a diagnostic Collection for the current file.  Overwriting the last...
    var diagnostics: vscode.Diagnostic[] = [];
    var result = res.body.result;
    var header: any = res.header;
    if (result.compiled === 'false') {
      const lineNumber: number = Number(result.line) - 1;
      const columnNumber: number = Number(result.column);
      var failureRange: vscode.Range = _document.lineAt(lineNumber).range;
      if (columnNumber > 0) {
        failureRange = failureRange.with(new vscode.Position(lineNumber, columnNumber));
      }
      diagnostics.push(new vscode.Diagnostic(failureRange, result.compileProblem));
    }
    vscode.window.forceCode.diagnosticCollection.set(_document.uri, diagnostics);
    // TODO: Make the Success message derive from the componentSuccesses, maybe similar to above code for failures
    if (diagnostics.length > 0) {
      vscode.window.forceCode.statusBarItem.text = `ForceCode: Execute Anonymous Errors $(alert)`;
      diagnostics.forEach(d => vscode.window.forceCode.outputChannel.appendLine(`Line ${Number(result.line)}: ${d.message}`));
    } else {
      vscode.window.forceCode.statusBarItem.text = `ForceCode: Execute Anonymous Success $(check)`;
    }
    return res;
  }
  function showResult(res) {
    return configuration().then(config => {
      vscode.window.forceCode.outputChannel.clear();
      vscode.window.forceCode.outputChannel.appendLine(debugOnly(config.debugOnly));
      vscode.window.forceCode.outputChannel.show();
      return res;
    });
    function debugOnly(shouldShowOnlyDebugLines) {
      if (shouldShowOnlyDebugLines) {
        return res.header.debugLog.split('\n').filter(l => l.match(new RegExp(vscode.window.forceCode.config.debugFilter || 'USER_DEBUG'))).join('\n');
      } else {
        return res.header.debugLog;
      }
    }
  }

}
