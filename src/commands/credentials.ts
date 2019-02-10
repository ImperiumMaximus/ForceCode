import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { getIcon } from '../parsers';
import * as error from '../util/error';
import { configuration } from '../services';
import { Config, Org } from '../forceCode';
import { UserInfo, ConnectionOptions } from 'jsforce';
const jsforce: any = require('jsforce');


const quickPickOptions: vscode.QuickPickOptions = {
    ignoreFocusOut: true
};

export const ADDPICKITEM: vscode.QuickPickItem = {
    description: '',
    label: '$(plus) Add new org',
}

export const EDITPICKITEM: vscode.QuickPickItem = {
    description: '',
    label: '$(pencil) Edit existing org'
}

export const REMOVEPICKITEM: vscode.QuickPickItem = {
    description: '',
    label: '$(trashcan) Remove existing org'
}

export const SETACTIVEPICKITEM: vscode.QuickPickItem = {
    description: '',
    label: '$(plug) Set active org' 
}

export default function manageCredentials() {
    vscode.window.forceCode.statusBarItem.text = 'ForceCode: Show Menu';
    return configuration().then(config => { 
        getAction()
        .then(action => processCredentialsAction(action, config)
            .catch(err => {
                vscode.window.forceCode.statusBarItem.text = `ForceCode: ${err}`;
                error.outputError(err, vscode.window.forceCode.outputChannel);
                Promise.reject(err)
            }))         
        .then(config => generateConfigFile(config))
    })
    .catch(err => { 
        vscode.window.forceCode.statusBarItem.text = `ForceCode: ${err}`;
        error.outputError(err, vscode.window.forceCode.outputChannel);
    })
    // =======================================================================================================================================
    // =======================================================================================================================================
    // =======================================================================================================================================
}

export function setActive() {
    vscode.window.forceCode.statusBarItem.text = 'ForceCode: Show Menu';
    return configuration().then(config => { 
        processCredentialsAction(SETACTIVEPICKITEM, config)
        .then(config => generateConfigFile(config))
        .catch(err => { 
            vscode.window.forceCode.statusBarItem.text = `ForceCode: ${err}`;
            error.outputError(err, vscode.window.forceCode.outputChannel);
        })
    })
    .catch(err => error.outputError(err, vscode.window.forceCode.outputChannel));
}

export function addOrg(config: Config) {
    vscode.window.forceCode.statusBarItem.text = 'ForceCode: Show Menu';
    return new Promise((resolve, reject) => {
        processCredentialsAction(ADDPICKITEM, config)
        .then(config => resolve(generateConfigFile(config)))
        .catch(err => {
            error.outputError(err, vscode.window.forceCode.outputChannel); 
            reject(err)}
        )
    })
}

function processCredentialsAction(action: vscode.QuickPickItem, config: Config): Promise<Config> {
    if (action === undefined) {
        return Promise.resolve(config)
    } else if (action.label === '$(plus) Add new org') {
        return getName()
            .then(org => getUsername(org))
            .then(org => getPassword(org))
            .then(org => getUrl(org))
            .then(org => setOrg(org, config))
    } else if (action.label === '$(pencil) Edit existing org') {
        return selectOrg(config)
            .then(sel => getName(sel))
            .then(sel => getPassword(sel))
            .then(sel => getUrl(sel))
            .then(sel => setOrg(sel, config))
    } else if (action.label === '$(trashcan) Remove existing org') {
        return selectOrg(config)
            .then(sel => confirmRemoval(sel))
            .then(sel => removeOrg(sel, config))
    } else if (action.label === '$(plug) Set active org') {
        return selectOrg(config)
            .then(sel => setActiveOrg(sel, config))
    }
}

function getAction(): Thenable<vscode.QuickPickItem> {
    let options: vscode.QuickPickItem[] = [
        ADDPICKITEM,
        EDITPICKITEM,
        REMOVEPICKITEM,
        SETACTIVEPICKITEM
    ]
    return vscode.window.showQuickPick(options, quickPickOptions)
}

function selectOrg(config: Config): Promise<{}> {
    return new Promise((resolve, reject) => {
        let options: vscode.QuickPickItem[] = config.orgs.map((org, index) => {
            return {
                description: org.url === 'https://test.salesforce.com' ? 'Sandbox / Test' : 'Production / Developer',
                label: (index === config.active ? '$(check) ' : '') + org.name
            }
        })
        return vscode.window.showQuickPick(options, quickPickOptions).then(opt => {
            if (opt === undefined) {
                reject({})
            }
            var index = options.indexOf(opt);
            return resolve({index: index , org: config.orgs[index]})
        })
    })
}

function confirmRemoval(sel) {
    return new Promise((resolve, reject) => {
        let options: vscode.QuickPickItem[] = [{
            description: `Confirm removal of ${sel.org.name}`,
            label: 'Remove',
        }, {
            description: 'Abort removal',
            label: 'Abort',
        },
        ];
        return vscode.window.showQuickPick(options, quickPickOptions).then((res: vscode.QuickPickItem) => {
            sel.index = res.label === 'Abort' ? -1 : sel.index
            resolve(sel)
        });
    })
}

function removeOrg(sel, config: Config) {
    if (sel.index >= 0 && config.orgs && config.orgs.length > sel.index) {
        config.orgs.splice(sel.index, 1)
        if (sel.index === config.active && config.orgs.length > 0) {
            config = Object.assign(config, config.orgs[0])
            config.active = 0;
            vscode.window.forceCode.currentOrgStatusBarItem.text = config.active !== undefined && config.orgs[config.active] ? config.orgs[config.active].name : 'No active Org';
        }
    }

    return config;
}

function setActiveOrg(sel, config: Config) {
    if (sel.index >= 0 && config.orgs && config.orgs.length > sel.index) {
        config = Object.assign(config, config.orgs[sel.index])
        config.active = sel.index;
    }
    vscode.window.forceCode.currentOrgStatusBarItem.text = config.active !== undefined && config.orgs[config.active] ? config.orgs[config.active].name : 'No active Org';

    return config;
}

function setOrg(sel, config: Config): Promise<Config> {
    return new Promise((resolve, reject) => {
        var connectionOptions: ConnectionOptions = {
            loginUrl: sel.org.url || 'https://login.salesforce.com',
          };
          if (config.proxyUrl) {
            connectionOptions.proxyUrl = config.proxyUrl;
          }
        let conn = new jsforce.Connection(connectionOptions)
        conn.login(sel.org.username, sel.org.password,  (err: Error, res: UserInfo) => {
            if (err) {
                reject(err)
            }
            sel.org.instanceUrl = conn.instanceUrl;
            if (sel.index === undefined) {
                if (!config.orgs) {
                    config.orgs = [];
                }
                if(config.orgs.push(sel.org) === 1) {
                    config = Object.assign(config, sel.org)
                    config.active = 0;
                }
            } else if (sel.index >= 0 && config.orgs && config.orgs.length > sel.index) {
                config.orgs[sel.index] = sel.org;
                if (config.active === sel.index) {
                    config = Object.assign(config, sel.org)
                }
            }
            vscode.window.forceCode.currentOrgStatusBarItem.text = config.active !== undefined && config.orgs[config.active] ? config.orgs[config.active].name : 'No active Org';
            resolve(config)
        })
    })
    

}


function getName(sel?: any) {
    return new Promise(function (resolve, reject) {
        if (sel === undefined) {
            sel = {org: {}}
        }
        //let org: Org = Object.assign({}, index >= 0 && config.orgs && config.orgs.length > index ? config.orgs[index] : { })
        let options: vscode.InputBoxOptions = {
            ignoreFocusOut: true,
            placeHolder: 'org name',
            value: sel.org.name || '',
            prompt: 'Please enter a SFDC org friendly name',
        };
        vscode.window.showInputBox(options).then(result => {
            sel.org.name = result || sel.org.name || '';
            if (!sel.org.name) { reject('No name'); };
            resolve(sel);
        });
    });
}

function getUsername(sel) {
    return new Promise(function (resolve, reject) {
        let options: vscode.InputBoxOptions = {
            ignoreFocusOut: true,
            placeHolder: 'mark@salesforce.com',
            value: sel.org.username || '',
            prompt: 'Please enter your SFDC username',
        };
        vscode.window.showInputBox(options).then(result => {
            sel.org.username = result || sel.org.username || '';
            if (!sel.org.username) { reject('No Username'); };
            resolve(sel);
        });
    })
}

function getPassword(sel) {
    let options: vscode.InputBoxOptions = {
        ignoreFocusOut: true,
        password: true,
        value: sel.org.password || '',
        placeHolder: 'enter your password and token',
        prompt: 'Please enter your SFDC password and token',
    };
    return vscode.window.showInputBox(options).then(function (result: string) {
        sel.org.password = result || sel.org.password || '';
        if (!sel.org.password) { throw 'No Password'; };
        return sel;
    });
}
function getUrl(sel) {
    let opts: any = [
        {
            icon: 'code',
            title: 'Production / Developer',
            url: 'https://login.salesforce.com',
        }, {
            icon: 'beaker',
            title: 'Sandbox / Test',
            url: 'https://test.salesforce.com',
        },
    ];
    let options: vscode.QuickPickItem[] = opts.map(res => {
        let icon: string = getIcon(res.icon);
        return {
            description: `${res.url}`,
            // detail: `${'Detail'}`,
            label: `$(${icon}) ${res.title}`,
        };
    });
    return vscode.window.showQuickPick(options, quickPickOptions).then((res: vscode.QuickPickItem) => {
        sel.org.url = res.description || 'https://login.salesforce.com';
        return sel;
    });
}
/*function getAutoCompile(org) {
    let options: vscode.QuickPickItem[] = [{
        description: 'Automatically deploy/compile files on save',
        label: 'Yes',
    }, {
        description: 'Deploy/compile code through the ForceCode menu',
        label: 'No',
    },
    ];
    return vscode.window.showQuickPick(options, quickPickOptions).then((res: vscode.QuickPickItem) => {
        org.autoCompile = res.label === 'Yes';
        return org;
    });
}*/

// =======================================================================================================================================
// =======================================================================================================================================
// =======================================================================================================================================
export function generateConfigFile(config) {
    const defaultOptions: {} = {
        autoRefresh: false,
        browser: 'Google Chrome Canary',
        pollTimeout: 1200,
        debugOnly: true,
        debugFilter: 'USER_DEBUG|FATAL_ERROR',
        deployOptions: {
            'checkOnly': false,
            'testLevel': 'runLocalTests',
            'verbose': false,
            'ignoreWarnings': true,
        },
        autoCompile: config.autoCompile || true
    };
    fs.outputFile(vscode.workspace.rootPath + path.sep + 'force.json', JSON.stringify(Object.assign(defaultOptions, config), undefined, 4));
    return config;
}