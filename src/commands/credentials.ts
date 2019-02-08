import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { getIcon } from '../parsers';
import * as error from '../util/error';
import { configuration } from '../services';
import { Config, Org } from '../forceCode';

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
        .then(action => processCredentialsAction(action, config))
        .then(config => generateConfigFile(config))
    })
    .catch(err => error.outputError(err, vscode.window.forceCode.outputChannel));
    /*return getUsername()
        .then(cfg => getPassword(cfg))
        .then(cfg => getUrl(cfg))
        .then(cfg => getAutoCompile(cfg))
        .then(cfg => finished(cfg))
        .catch(err => error.outputError(err, vscode.window.forceCode.outputChannel));*/
    // =======================================================================================================================================
    // =======================================================================================================================================
    // =======================================================================================================================================
}

export function setActive() {
    vscode.window.forceCode.statusBarItem.text = 'ForceCode: Show Menu';
    return configuration().then(config => { 
        processCredentialsAction(SETACTIVEPICKITEM, config)
        .then(config => generateConfigFile(config))
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
    return new Promise(function (resolve, reject) {
        let index: number;
        if (action === undefined) {
            resolve(config)
        } else if (action.label === '$(plus) Add new org') {
            resolve(getName()
                .then(org => getUsername(org))
                .then(org => getPassword(org))
                .then(org => getUrl(org))
                .then(org => setOrg(org, config))
                .then(config => {
                    if (config.orgs.length === 1)
                        return setActiveOrg(0, config)
                    return config;
                }))
        } else if (action.label === '$(pencil) Edit existing org') {
            getOrgIndex(config).then(index => {
                resolve(getName(index, config)
                .then(org => getUsername(org))
                .then(org => getPassword(org))
                .then(org => getUrl(org))
                .then(org => setOrg(org, config, index))
                .then(config => {
                    if (config.active === index)
                        return setActiveOrg(index, config)
                    return config;
                }))
            })
        } else if (action.label === '$(trashcan) Remove existing org') {
            getOrgIndex(config)
                .then(index => {
                    var cfg = removeOrg(index, config)
                    if (index === cfg.active && cfg.orgs.length > 0) {
                        cfg = setActiveOrg(0, cfg)
                    }
                    resolve (cfg)
                })
        
        } else if (action.label === '$(plug) Set active org') {
            getOrgIndex(config)
                .then(index => resolve(setActiveOrg(index, config)))
        }
    })
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

function getOrgIndex(config: Config) {
    let options: vscode.QuickPickItem[] = config.orgs.map((org, index) => {
        return {
            description: org.url === 'https://test.salesforce.com' ? 'Sandbox / Test' : 'Production / Developer',
            label: (index === config.active ? '$(check) ' : '') + org.name
        }
    })
    return vscode.window.showQuickPick(options, quickPickOptions).then(opt => {
        return options.indexOf(opt)
    })
}

function removeOrg(index: number, config: Config) {
    if (index >= 0 && config.orgs && config.orgs.length > index) {
        config.orgs.splice(index, 1)
    }

    return config;
}

function setOrg(org: Org, config: Config, index?: number) {
    if (index === undefined) {
        if (!config.orgs) {
            config.orgs = [];
        }
        config.orgs.push(org);
    } else if (index >= 0 && config.orgs && config.orgs.length > index) {
        config.orgs[index] = org;
    }
    return config;

}

function setActiveOrg(index: number, config: Config) {
    if (index >= 0 && config.orgs && config.orgs.length > index) {
        var org: Org = config.orgs[index]
        config.username = org.username;
        config.password = org.password;
        config.url = org.url;
        config.prefix = org.prefix;
        config.active = index
        config.apiVersion = org.apiVersion;
        vscode.window.forceCode.currentOrgStatusBarItem.text = config.active !== undefined && config.orgs[config.active] ? config.orgs[config.active].name : 'No active Org';
    }
    return config;
}

function getName(index?: number, config?: Config) {
    return new Promise(function (resolve, reject) {
        let org: Org = Object.assign({}, index >= 0 && config.orgs && config.orgs.length > index ? config.orgs[index] : { apiVersion: "44.0" })
        let options: vscode.InputBoxOptions = {
            ignoreFocusOut: true,
            placeHolder: 'org name',
            value: (index >= 0 && config.orgs && config.orgs.length > index) ? config.orgs[index].name : '',
            prompt: 'Please enter a SFDC org friendly name',
        };
        vscode.window.showInputBox(options).then(result => {
            org.name = result || ((index >= 0 && config.orgs && config.orgs.length > index) ? config.orgs[index].name : '');
            if (!org.name) { reject('No name'); };
            resolve(org);
        });
    });
}

function getUsername(org) {
    return new Promise(function (resolve, reject) {
        let options: vscode.InputBoxOptions = {
            ignoreFocusOut: true,
            placeHolder: 'mark@salesforce.com',
            value: org.username || '',
            prompt: 'Please enter your SFDC username',
        };
        vscode.window.showInputBox(options).then(result => {
            org.username = result || org.username || '';
            if (!org.username) { reject('No Username'); };
            resolve(org);
        });
    })
}

function getPassword(org) {
    let options: vscode.InputBoxOptions = {
        ignoreFocusOut: true,
        password: true,
        value: org.password || '',
        placeHolder: 'enter your password and token',
        prompt: 'Please enter your SFDC password and token',
    };
    return vscode.window.showInputBox(options).then(function (result: string) {
        org.password = result || org.password || '';
        if (!org.password) { throw 'No Password'; };
        return org;
    });
}
function getUrl(org) {
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
        org.url = res.description || 'https://login.salesforce.com';
        return org;
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
        apiVersion: '45.0',
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