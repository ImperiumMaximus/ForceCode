import * as vscode from 'vscode';
import Workspace from './workspace';
import * as forceCode from '../forceCode';
import { operatingSystem } from '.';
import constants from '../models/constants';
import { configuration } from '.';
import * as error from '../util/error';
import * as commands from '../commands';
//import * as jsforce from 'jsforce';
import { SuccessResult, ErrorResult, RecordResult, ConnectionOptions, ListMetadataQuery, FileProperties, UserInfo } from 'jsforce';
import { resolve } from 'dns';
import { addOrg } from '../commands/credentials';
const jsforce: any = require('jsforce');
const pjson: any = require('./../../../package.json');
const fetch = require('node-fetch');

export default class ForceService implements forceCode.IForceService {
  public config: forceCode.Config;
  public conn: any;
  public containerId: string;
  public containerMembers: forceCode.IContainerMember[];
  public describe: forceCode.IMetadataDescribe;
  public apexMetadata: FileProperties[];
  public declarations: forceCode.IDeclarations;
  public codeCoverage: {} = {};
  public codeCoverageWarnings: forceCode.ICodeCoverageWarning[];
  public containerAsyncRequestId: string;
  public userInfo: any;
  public isLoggedIn: boolean;
  public username: string;
  public url: string;
  public version: string;
  public statusBarItem: vscode.StatusBarItem;
  public currentOrgStatusBarItem: vscode.StatusBarItem;
  public outputChannel: vscode.OutputChannel;
  public operatingSystem: string;
  public workspaceRoot: string;
  public workspaceMembers: forceCode.IWorkspaceMember[];
  public diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    // Set the ForceCode configuration
    this.operatingSystem = operatingSystem.getOS();
    // Setup username and outputChannel
    this.outputChannel = vscode.window.createOutputChannel(
      constants.OUTPUT_CHANNEL_NAME
    );
    this.currentOrgStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      6
    )
    this.currentOrgStatusBarItem.command = 'ForceCode.setActiveOrg';
    this.currentOrgStatusBarItem.tooltip = 'Set the current Org';
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      5
    );
    this.statusBarItem.command = 'ForceCode.showMenu';
    this.statusBarItem.tooltip = 'Open the ForceCode Menu';
    this.statusBarItem.text = 'ForceCode: Active';
    this.containerMembers = [];
    this.apexMetadata = [];
    this.declarations = {};
    configuration(this)
      .then(config => {
        this.username = config.username || '';
        this.conn = new jsforce.Connection({
          loginUrl: config.url || 'https://login.salesforce.com'
        });
        this.statusBarItem.text = `ForceCode ${pjson.version} is Active`;
        this.currentOrgStatusBarItem.text = config.active !== undefined && config.orgs[config.active] ? config.orgs[config.active].name : 'No active Org';
      })
      .catch(err => {
        this.statusBarItem.text = 'ForceCode: Missing Configuration';
      });
    this.statusBarItem.show();
    this.currentOrgStatusBarItem.show();
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('ForceCode-' + newGuid());
  }
  public connect(): Promise<forceCode.IForceService> {
    return this.setupConfig().then(this.login);
  }

  public restUrl(): string {
    return `${vscode.window.forceCode.conn.instanceUrl}/services/data/v${
      vscode.window.forceCode.conn.version
      }`;
  }

  public clearLog() {
    this.outputChannel.clear();
  }

  public newContainer(force: Boolean): Promise<forceCode.IForceService> {
    var self: forceCode.IForceService = vscode.window.forceCode;
    if (self.containerId && !force) {
      return Promise.resolve(self);
    } else {
      return self.conn.tooling
        .sobject('MetadataContainer')
        .create({ name: 'ForceCode-' + Date.now() })
        .then((value: SuccessResult | ErrorResult | RecordResult[]) => {
          if (!value['success']) {
            throw new Error(value['errors'].join(', '))
          }
          self.containerId = value['id'];
          self.containerMembers = [];
          return self;
        });
    }
  }

  public refreshApexMetadata() {
    return vscode.window.forceCode.conn.metadata.describe().then(describe => {
      vscode.window.forceCode.describe = describe;
      var apexTypes: ListMetadataQuery[] = describe.metadataObjects
        .filter(
          o =>
            o.xmlName.startsWith('ApexClass') ||
            o.xmlName.startsWith('ApexTrigger')
        )
        .map(o => {
          return {
            type: o.xmlName,
            folder: o.directoryName
          };
        });

      return vscode.window.forceCode.conn.metadata
        .list(apexTypes)
        .then(res => {
          vscode.window.forceCode.apexMetadata = res;
          return res;
        })
        .then(new Workspace().getWorkspaceMembers)
        .then(members => {
          this.workspaceMembers = members;
        });
    });
  }

  // TODO: Add keychain access so we don't have to use a username or password'
  // var keychain = require('keytar')
  private setupConfig(): Promise<forceCode.Config> {
    var self: forceCode.IForceService = vscode.window.forceCode;
    // Setup username and outputChannel
    //self.username = (self.config && self.config.username) || '';
    if (!self.config || !self.config.username) {
      addOrg(self.config)
      .then(config => {
        return Object.assign(self.config, config);
      });
    }
    return configuration();
  }

  private async login(config): Promise<forceCode.IForceService> {
    async function getLatestVersion(instanceUrl: string): Promise<string> {
      let response = await fetch(`${instanceUrl}/services/data`)
      let versions = await response.json()
      return versions.map(v => v.version).sort((a, b) => Number(b) - Number(a))[0];
    }

    var self: forceCode.IForceService = vscode.window.forceCode;
    // Lazy-load the connection
    self.version = '44.0';
    if (self.config.instanceUrl) {
      self.version = await getLatestVersion(self.config.instanceUrl);
      }
    if (
      self.userInfo === undefined ||
      self.config.username !== self.username ||
      self.config.url !== self.url ||
      (self.conn && (self.conn.version !== self.version)) ||
      !self.config.password
    ) {
      var connectionOptions: ConnectionOptions = {
        loginUrl: self.config.url || 'https://login.salesforce.com',
        version: self.version
      };
      if (self.config.proxyUrl) {
        connectionOptions.proxyUrl = self.config.proxyUrl;
      }
      self.conn = new jsforce.Connection(connectionOptions);

      if (!config.username || !config.password) {
        vscode.window.forceCode.outputChannel.appendLine(
          'The force.json file seems to not have a username and/or password. Pease ensure you have a properly formatted config file, or submit an issue to the repo @ https"//github.com/celador/forcecode/issues '
        );
        throw { message: 'ForceCode: $(alert) Missing Credentials $(alert)' };
      }
      vscode.window.forceCode.statusBarItem.text = `ForceCode: $(plug) Connecting as ${
        config.username
        }`;
      return doLogin()
        .then(connectionSuccess)
        .catch(connectionError)
        .then(getNamespacePrefix)
        .then(refreshApexMetadata)
        .then(getPublicDeclarations)
        .then(getPrivateDeclarations)
        .then(getManagedDeclarations)
        .catch(err => {
          if (self.userInfo) { self.userInfo = undefined; }
          error.outputError(err, vscode.window.forceCode.outputChannel) 
        });

      function doLogin(): Promise<UserInfo> {
        return new Promise((resolve, reject) => {
          self.conn.login(config.username, config.password,  (err: Error, res: UserInfo) => {
            if(err) {
              reject(err);
            }
            resolve(res);
          });
        }) 
      }

      function connectionSuccess(userInfo) {
        vscode.window.forceCode.statusBarItem.text = `ForceCode: $(zap) Connected as ${
          self.config.username
          } (on v${self.conn.version}) $(zap)`;
        self.outputChannel.appendLine(
          `Connected as ${JSON.stringify(userInfo)} (on v${self.conn.version})`
        );
        self.userInfo = userInfo;
        self.username = config.username;
        self.url = config.url;
        self.isLoggedIn = true;
        return self;
      }
      function connectionError(err) {
        vscode.window.forceCode.statusBarItem.text = `ForceCode: $(alert) Connection Error $(alert)`;
        self.outputChannel.appendLine(
          '================================================================'
        );
        self.outputChannel.appendLine(err.message);
        self.isLoggedIn = false;
        throw err;
      }

      function getNamespacePrefix(svc: forceCode.IForceService) {
        return svc.conn
          .query('SELECT NamespacePrefix FROM Organization')
          .then(res => {
            if (res && res.records.length && res.records[0]['NamespacePrefix']) {
              svc.config.prefix = res.records[0]['NamespacePrefix'];
            } else {
              svc.config.prefix = '';
            }
            return svc;
          })
          .catch(err => {
            svc.outputChannel.appendLine(err);
          });
      }
      function refreshApexMetadata(svc) {
        vscode.window.forceCode.refreshApexMetadata();
        return svc;
      }
      function getPublicDeclarations(svc) {
        var requestUrl: string =
          svc.conn.instanceUrl +
          `/services/data/v${svc.conn.version}/tooling/completions?type=apex`;
        var headers: any = {
          Accept: 'application/json',
          Authorization: 'OAuth ' + svc.conn.accessToken
        };
        require('node-fetch')(requestUrl, { method: 'GET', headers })
          .then(response => response.json())
          .then(json => {
            self.declarations.public = json.publicDeclarations;
          });
        return svc;
      }
      function getPrivateDeclarations(svc) {
        var query: string =
          "SELECT Id, ApiVersion, Name, NamespacePrefix, SymbolTable, LastModifiedDate FROM ApexClass WHERE NamespacePrefix = '" +
          self.config.prefix +
          "'";
        self.declarations.private = [];
        self.conn.tooling
          .query(query)
          .then(res => accumulateAllRecords(res, self.declarations.private));
        return svc;
      }
      function getManagedDeclarations(svc) {
        var query: string =
          "SELECT Id, Name, NamespacePrefix, SymbolTable, LastModifiedDate FROM ApexClass WHERE NamespacePrefix != '" +
          self.config.prefix +
          "'";
        self.declarations.managed = [];
        self.conn.tooling
          .query(query)
          .then(res => accumulateAllRecords(res, self.declarations.managed));
        return svc;
      }
      function accumulateAllRecords(result, accumulator) {
        if (
          result &&
          result.done !== undefined &&
          Array.isArray(result.records)
        ) {
          if (result.done) {
            result.records.forEach(record => {
              accumulator.push(record);
            });
            return result;
          } else {
            result.records.forEach(record => {
              accumulator.push(record);
            });
            return self.conn.tooling
              .queryMore(result.nextRecordsUrl)
              .then(res => accumulateAllRecords(res, accumulator));
          }
        }
      }
    } else {
      // self.outputChannel.appendLine(`Connected as ` + self.config.username);
      // vscode.window.forceCode.statusBarItem.text = `ForceCode: $(history) ${self.config.username}`;
      return Promise.resolve(self);
    }
  }
}

function newGuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : ( r & 0x3 | 0x8 );
      return v.toString(16);
  });
}
