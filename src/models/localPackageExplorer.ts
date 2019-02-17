import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';

const parseString: any = require('xml2js').parseString;

const LOCAL_PROVIDER = 'forcecode://localpackage';

export interface LocalPackageExplorerNode {
  resource: vscode.Uri;
  label: string;
  isFolder: boolean
}


export class LocalPackageExplorerModel {

  public nodes: Map<string, LocalPackageExplorerNode> = new Map<string, LocalPackageExplorerNode>();

  constructor() {
  }

  public get roots(): Thenable<LocalPackageExplorerNode[]> {
    return new Promise(function (resolve, reject) {
      if (fs.existsSync(`${vscode.window.forceCode.workspaceRoot}${path.sep}package.xml`)) {
        var xmlPackage: string = fs.readFileSync(`${vscode.window.forceCode.workspaceRoot}${path.sep}package.xml`, 'utf-8')
        parseString(xmlPackage, { explicitArray: false, async: true }, function (err, result) {
          if (err) {
              reject(err);
          }
          if (result.hasOwnProperty('Package') && result.Package.hasOwnProperty('types') && Array.isArray(result.Package.types)) {
            resolve(result.Package.types.map(type => {
              return {
                resource: vscode.Uri.parse(`${LOCAL_PROVIDER}/${type.name}`),
                label: type.name,
                isFolder: true
              }
            }))
          }
        })
      } else {
        resolve([{ resource: null, label: '', isFolder: false }])
      }
    })
  }
}

export class LocalPackageExplorerProvider implements vscode.TreeDataProvider<LocalPackageExplorerNode> {

  private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
	readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event;

  constructor(public readonly model: LocalPackageExplorerModel) { }
 
  public getTreeItem(element: LocalPackageExplorerNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return new LocalPackageExplorerItem(element.label, 
      element.isFolder ? vscode.TreeItemCollapsibleState.Collapsed : void 0)
  }

  public getChildren(element?: LocalPackageExplorerNode): LocalPackageExplorerNode[] | Thenable<LocalPackageExplorerNode[]> {
    return element ? [] : this.model.roots;
	}
}

export class LocalPackageExplorerItem extends vscode.TreeItem {

	constructor(
    public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
	) {
		super(label, collapsibleState);
  }


	get tooltip(): string {
		return `${this.label}`;
	}

	get description(): string {
		return '';
  }
  
  iconPath = {
		light: path.join(__filename, '..', '..', '..', '..', 'images', 'light', 'code.svg'),
		dark: path.join(__filename, '..', '..', '..', '..', 'images', 'dark', 'code.svg')
	};



}