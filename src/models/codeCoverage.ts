import * as vscode from 'vscode';
import * as path from 'path';


import { PROVIDER } from '../providers/ContentProvider';

export interface ApexClassCoverageNode {
  resource: vscode.Uri;
  label: string;
  coveragePercent: string;
  coveredLines: number;
  uncoveredLines: number;
  isOverall: boolean
}

export class ApexClassCoverageModel {

  private nodes: Map<string, ApexClassCoverageNode> = new Map<string, ApexClassCoverageNode>();

  constructor(private context: vscode.ExtensionContext) {
  }

  public get roots(): Thenable<ApexClassCoverageNode[]> {
    return vscode.window.forceCode.connect(this.context)
      .then(retrieveClasses)
      .then(filterClasses)
      .then(retrieveCoverage)
      .then(retrieveOverall)


    function retrieveClasses(svc) {
      if (vscode.window.forceCode.userInfo !== undefined) {
        return vscode.window.forceCode.conn.tooling.sobject('ApexClass').
          find({ CreatedById: vscode.window.forceCode.userInfo.id, NamespacePrefix: vscode.window.forceCode.config.prefix || '' }, ['Id', 'Name', 'Body']).execute()
      }
    }

    function filterClasses(results: Array<any>) {
      return results.filter(result => !/@istest/i.test(result.Body))
        .reduce((prev, curr) => {
          prev[curr.Id] = curr.Name
          return prev
        }, {})
    } 

    async function retrieveCoverage(classes: {}) {
      var batchSize: number = 25;
      var j: number = 0;
      var coverageRecords: Array<ApexClassCoverageNode> = []
      var allIds = Object.keys(classes)
      while (j < allIds.length) {
        var ids = '(' + allIds.slice(j, j + batchSize).map(id => `'${id}'`).join(',') + ')'
        var res = await vscode.window.forceCode.conn.tooling.query(`SELECT ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate WHERE ApexClassorTriggerId IN ${ids} ORDER BY ApexClassorTrigger.Name`)
        coverageRecords = coverageRecords.concat(res.records.map(cov => {
          return {
            resource: vscode.Uri.parse(`${PROVIDER}/ApexClass/${classes[cov.ApexClassOrTriggerId]}`),
            label: classes[cov.ApexClassOrTriggerId],
            coveragePercent: (cov.NumLinesCovered / (cov.NumLinesCovered + cov.NumLinesUncovered) * 100).toFixed(0) + '%',
            coveredLines: cov.NumLinesCovered,
            uncoveredLines: cov.NumLinesUncovered,
            isOverall: false
          }
        }));
        j += batchSize
      }

      return coverageRecords;
    }

    async function retrieveOverall(nodes: Array<ApexClassCoverageNode>) {
      var orgWideCoverage = await vscode.window.forceCode.conn.tooling.query('SELECT PercentCovered from ApexOrgWideCoverage')
      nodes.unshift({
        resource: vscode.Uri.parse(`Overall`),
        label: 'Overall',
        coveragePercent: orgWideCoverage.records[0].PercentCovered.toFixed(0) + '%',
        coveredLines: 0,
        uncoveredLines: 0,
        isOverall: true
      })
      return nodes;
    }
  }
}

export class ApexClassCoverageTreeDataProvider implements vscode.TreeDataProvider<ApexClassCoverageNode> {

  private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
	readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event;

	constructor(private readonly model: ApexClassCoverageModel) { }

	public refresh(): any {
		this._onDidChangeTreeData.fire();
	}


	public getTreeItem(element: ApexClassCoverageNode): vscode.TreeItem {
    return new ApexClassCoverageItem(element.label, element.coveredLines, element.uncoveredLines, element.coveragePercent, void 0, null, element.isOverall);
	}

	public getChildren(element?: ApexClassCoverageNode): ApexClassCoverageNode[] | Thenable<ApexClassCoverageNode[]> {
    return element ? [] : this.model.roots;
	}

	/*public provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
		return this.model.getContent(uri).then(content => content);
	}*/
}

export class ApexClassCoverageItem extends vscode.TreeItem {

	constructor(
    public readonly label: string,
    private coveredLines: number,
    private uncoveredLines: number,
		private coveragePercent: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    private isOverall?: boolean
	) {
		super(label, collapsibleState);
  }


	get tooltip(): string {
		return `${this.label}: ${this.coveragePercent}` + (this.isOverall ? '' : `(${this.coveredLines}/${this.uncoveredLines + this.coveredLines})`);
	}

	get description(): string {
		return `${this.coveragePercent} ` + (this.isOverall ? '' : `(${this.coveredLines}/${this.uncoveredLines + this.coveredLines})`);
  }
  
  iconPath = {
		light: this.isOverall ? '' : path.join(__filename, '..', '..', '..', '..', 'images', 'light', 'code.svg'),
		dark: this.isOverall ? '' : path.join(__filename, '..', '..', '..', '..', 'images', 'dark', 'code.svg')
	};



}