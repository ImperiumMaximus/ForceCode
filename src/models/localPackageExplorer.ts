import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { getFileName2 } from '../parsers/getName';
import { IForceService } from '../forceCode';

const parseString: any = require('xml2js').parseString;

const LOCAL_PROVIDER = 'forcecode://localpackage';

export interface LocalPackageExplorerNode {
  resource: vscode.Uri;
  label: string;
  isFolder: boolean;
  containsWildcard?: boolean,
  children?: LocalPackageExplorerNode[];
}


export class LocalPackageExplorerModel {

  /*public roots: Map<string, Array<LocalPackageExplorerNode>> = new Map<string, Array<LocalPackageExplorerNode>>();*/

  constructor() {
  }

  public get roots(): Thenable<LocalPackageExplorerNode[]> {
    return parsePackageXml()

    function parsePackageXml(): Thenable<LocalPackageExplorerNode[]> {
      return new Promise((resolve, reject) => {
      if (fs.existsSync(`${vscode.window.forceCode.workspaceRoot}${path.sep}package.xml`)) {
          var xmlPackage: string = fs.readFileSync(`${vscode.window.forceCode.workspaceRoot}${path.sep}package.xml`, 'utf-8')
          parseString(xmlPackage, { explicitArray: false, async: true }, function (err, result) {
            if (err) {
              reject(err)
            }
            if (result.hasOwnProperty('Package') && result.Package.hasOwnProperty('types') && Array.isArray(result.Package.types)) {
              resolve(result.Package.types.map(type => {
                let node: LocalPackageExplorerNode = {
                  resource: vscode.Uri.parse(`${LOCAL_PROVIDER}/${type.name}`),
                  label: type.name,
                  isFolder: true,
                  containsWildcard: false,
                  children: []
                }
                if (type.hasOwnProperty('members')) {
                  if (Array.isArray(type.members)) {
                    node.children.push(...type.members.map(member => {
                      return {
                        resource: vscode.Uri.parse(`${LOCAL_PROVIDER}/${type.name}/${member}`),
                        label: member,
                        isFolder: false
                      }
                    }))
                  } else if (type.members === '*' /*&& describeByXmlName.hasOwnProperty(type.name)*/) {
                    //let folderName = describeByXmlName[type.name].directoryName;

                    node.containsWildcard = true;
                    node.children.push({resource: vscode.Uri.parse(`${LOCAL_PROVIDER}/${type.name}/*`), label: '*', isFolder: false});
                    /*if (fs.existsSync(`${vscode.window.forceCode.workspaceRoot}${path.sep}${folderName}`)) {
                      node.children.push(...
                        fs.readdirSync(`${vscode.window.forceCode.workspaceRoot}${path.sep}${folderName}`).map(file => {
                          if (!file.endsWith('-meta.xml')) {
                            return {
                              resource: vscode.Uri.parse(`${LOCAL_PROVIDER}/${type.name}/${getFileName2(file)}`),
                              label: getFileName2(file),
                              isFolder: false,
                              containsWildcard: false,
                              children: []
                            }
                          }
                        })
                      );
                    }*/
                  }
                }
                return node
              }))
            }
          })
        } else {
          resolve([{ resource: null, label: '', isFolder: false }]);
        }
    })}

    function describeMetadata(svc: IForceService) {
      return vscode.window.forceCode.conn.metadata.describe()
    }

    function groupByXmlName(describeResult) {
      return describeResult.metadataObjects.reduce((prev, curr) => {
        prev[curr.xmlName] = curr;
        return prev;
      }, {})
    }
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
    //return element ? (element.isFolder ? element.children : []) : this.model.roots;
    if (!element) {
      return this.model.roots;
    } else if (element.isFolder) {
      if (element.containsWildcard) {
        
        return vscode.window.forceCode.connect()
        .then(svc => { return vscode.window.forceCode.conn.metadata.list([{type: element.label}]).then(members => {
          if (!members) {
            element.children = [];
            element.isFolder = false;
          } else {
            if (!Array.isArray(members)) {
              members = [members]
            }
            element.children = members.map(member => {
              return {
                resource: vscode.Uri.parse(`${LOCAL_PROVIDER}/${element.label}/${member.fullName}`),
                label: member.fullName,
                isFolder: false 
              }
            })
          }
          return element.children;
        });
      });
      } else {
      return element.children;
      }
    }
    element.isFolder = false;
    return [];
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