import * as vscode from 'vscode';
import * as parsers from '../parsers';
import sleep from '../util/sleep';
import { IForceService } from '../forceCode';
import * as forceCode from '../forceCode';
import * as error from '../util/error';
import diff from './diff';
import { configuration } from '../services';
import { generateConfigFile } from './credentials';
// import jsforce = require('jsforce');
const parseString: any = require('xml2js').parseString;
// TODO: Refactor some things out of this file.  It's getting too big.
import fs = require('fs');

var elegantSpinner: any = require('elegant-spinner');
const UPDATE: boolean = true;
const CREATE: boolean = false;

interface ContainerAsyncRequest {
    done: boolean;
    size: Number;
    totalSize: Number;
    records?: any[];
    errors?: any[];
    State?: string;
}


export default function compile(document: vscode.TextDocument, context: vscode.ExtensionContext): Promise<any> {
    const body: string = document.getText();
    const ext: string = parsers.getFileExtension(document);
    const toolingType: string = parsers.getToolingType(document);
    const fileName: string = parsers.getFileName(document);
    const name: string = parsers.getName(document, toolingType);
    const spinner: any = elegantSpinner();
    var checkCount: number = 0;
    var interval: any = undefined;

    /* tslint:disable */
    var DefType: string = undefined;
    var Format: string = undefined;
    var Source: string = undefined;
    var FilePath: string = undefined;
    var currentObjectDefinition: any = undefined;
    var AuraDefinitionBundleId: string = undefined;
    var LightningComponentBundleId: string = undefined;
    var Id: string = undefined;
    /* tslint:enable */
    // Start doing stuff
    vscode.window.forceCode.statusBarItem.text = `${name} ${DefType ? DefType : ''}` + spinner();
    if (isMetadata(document) && toolingType === undefined) {
        // This process uses the Metadata API to deploy specific files
        // This is where we extend it to create any kind of metadata
        // Currently only Objects and Permission sets ...
        return vscode.window.forceCode.connect(context)
            .then(createMetaData)
            .then(compileMetadata)
            .then(reportMetadataResults)
            .then(finished)
            .catch(onError);
    } else if (toolingType === undefined) {
        return Promise
            .reject({ message: 'Metadata Describe Error. Please try again.' })
            .catch(onError);
    } else if (toolingType === 'AuraDefinition') {
        DefType = parsers.getAuraDefTypeFromDocument(document);
        Format = getAuraFormatFromDocument(document);
        Source = document.getText();
        // Aura Bundles are a special case, since they can be upserted with the Tooling API
        // Instead of needing to be compiled, like Classes and Pages..
        return vscode.window.forceCode.connect(context)
            .then(svc => getAuraBundle(svc)
                .then(ensureAuraBundle)
                .then(bundle => getAuraDefinition(svc, bundle)
                    .then(definitions => upsertAuraDefinition(definitions, bundle)
                    )
                )
            ).then(finished, onError);
    } else if (toolingType === 'LightningComponent') {
        DefType = getLWCDefTypeFromDocument(document);
        Format = getLWCFormatFromDocument(document);
        Source = document.getText();
        FilePath = document.fileName.substring(document.fileName.lastIndexOf('/src/lwc') + 5);

        return vscode.window.forceCode.connect(context)
            .then(svc => getLWCBundle(svc)
            .then(ensureLWCBundle)
            .then(bundle => getLWCResource(svc, bundle)
                .then(resources => upsertLWCResource(resources, bundle)
                )
            )
        ).then(finished, onError);
    } else {
        // This process uses the Tooling API to compile special files like Classes, Triggers, Pages, and Components
        if (vscode.window.forceCode.isCompiling) {
            vscode.window.forceCode.queueCompile = true;
            return Promise.reject({ message: 'Already compiling' });
        }
        clearInterval(interval);
        interval = setInterval(function () {
            if (checkCount <= 10) {
                vscode.window.forceCode.statusBarItem.color = new vscode.ThemeColor('statusBar.foreground');
            }
            if (checkCount > 10) {
                vscode.window.forceCode.statusBarItem.color = 'orange';
            }
            if (checkCount > 20) {
                vscode.window.forceCode.statusBarItem.color = 'red';
            }
            if (checkCount > 30) {
                clearInterval(interval);
                checkCount = 0;
                vscode.window.forceCode.statusBarItem.color = 'red';
            }
            vscode.window.forceCode.statusBarItem.text = `${name} ${DefType ? DefType : ''}` + spinner();
        }, 50);

        vscode.window.forceCode.isCompiling = true;
        return vscode.window.forceCode.connect(context)
            .then(addToContainer)
            .then(requestCompile)
            .then(getCompileStatus)
            .then(finished, onError)
            .then(containerFinished);
    }

    // =======================================================================================================================================
    // ================================                  All Metadata                  ===========================================
    // =======================================================================================================================================
    function isMetadata(doc: vscode.TextDocument) {
        if (vscode.window.forceCode.describe && vscode.window.forceCode.describe.metadataObjects) {
            return getMetaType(doc) !== undefined;
        }
        return false;
    }
    function getMetaType(doc: vscode.TextDocument) {
        if (vscode.window.forceCode.describe && vscode.window.forceCode.describe.metadataObjects) {
            let extension: string = doc.fileName.slice(doc.fileName.lastIndexOf('.')).replace('.', '');
            let foo: any[] = vscode.window.forceCode.describe.metadataObjects.filter(o => {
                return o.suffix === extension;
            });
            if (foo.length) {
                return foo[0].xmlName;
            }
        }
    }

    function createMetaData(svc) {
        vscode.window.forceCode.statusBarItem.text = 'Create Metadata';
        let text: string = document.getText();

        return new Promise(function (resolve, reject) {
            parseString(text, { explicitArray: false, async: true }, function (err, result) {
                if (err) {
                    reject(err);
                }
                var metadata: any = result[getMetaType(document)];
                if (metadata) {
                    delete metadata['$'];
                    delete metadata['_'];
                    metadata.fullName = fileName;
                    resolve(metadata);
                }
                reject({ message: getMetaType(document) + ' metadata type not found in org' });
            });
        });
    }

    function compileMetadata(metadata) {
        vscode.window.forceCode.statusBarItem.text = 'Deploying...';
        return vscode.window.forceCode.conn.metadata.upsert(getMetaType(document), [metadata]);
    }

    function reportMetadataResults(result) {
        if (Array.isArray(result) && result.length && !result.some(i => !i.success)) {
            vscode.window.forceCode.statusBarItem.text = 'Successfully deployed ' + result[0].fullName;
            return result;
        } else if (Array.isArray(result) && result.length && result.some(i => !i.success)) {
            let error: string = result.filter(i => !i.success).map(i => i.fullName).join(', ') + ' Failed';
            vscode.window.forceCode.statusBarItem.text = '' + error;
            throw { message: error };
        } else if (typeof result === 'object' && result.success) {
            vscode.window.forceCode.statusBarItem.text = 'Successfully deployed ' + result.fullName;
            return result;
        } else {
            var error: any = result.errors ? result.errors[0] : 'Unknown Error';
            vscode.window.forceCode.statusBarItem.text = '' + error;
            throw { message: error };
        }
    }

    // =======================================================================================================================================
    // ================================                Lightning Components               ===========================================
    // =======================================================================================================================================
    function getAuraBundle(svc) {
        return vscode.window.forceCode.conn.tooling.sobject('AuraDefinitionBundle').find({
            'DeveloperName': name, NamespacePrefix: vscode.window.forceCode.config.prefix || ''
        });
    }
    function ensureAuraBundle(results) {
        // If the Bundle doesn't exist, create it, else Do nothing
        if (!results[0] || results[0].length === 0) {
            // Create Aura Definition Bundle
            return vscode.window.forceCode.conn.tooling.sobject('AuraDefinitionBundle').create({
                'DeveloperName': name,
                'MasterLabel': name,
                'ApiVersion': vscode.window.forceCode.version || vscode.window.forceCode.conn.version || '37.0',
                'Description': name.replace('_', ' '),
            }).then(bundle => {
                results[0] = [bundle];
                return results;
            });
        } else {
            return results;
        }
    }
    function getAuraDefinition(svc, bundle) {
        return vscode.window.forceCode.conn.tooling.sobject('AuraDefinition').find({
            'AuraDefinitionBundleId': bundle[0].Id
        });
    }
    function upsertAuraDefinition(definitions, bundle) {
        // If the Definition doesn't exist, create it
        var def: any[] = definitions.filter(result => result.DefType === DefType);
        currentObjectDefinition = def.length > 0 ? def[0] : undefined;
        if (currentObjectDefinition !== undefined) {
            AuraDefinitionBundleId = currentObjectDefinition.AuraDefinitionBundleId;
            Id = currentObjectDefinition.Id;
            return vscode.window.forceCode.conn.tooling.sobject('AuraDefinition').update({ Id: currentObjectDefinition.Id, Source });
        } else if (bundle[0]) {
            return vscode.window.forceCode.conn.tooling.sobject('AuraDefinition').create({ AuraDefinitionBundleId: bundle[0].Id, DefType, Format, Source });
        }
    }
    /*function getAuraDefTypeFromDocument(doc: vscode.TextDocument) {
        var extension: string = ext.toLowerCase();
        switch (extension) {
            case 'app':
                // APPLICATION — Lightning Components app
                return 'APPLICATION';
            case 'cmp':
                // COMPONENT — component markup
                return 'COMPONENT';
            case 'auradoc':
                // DOCUMENTATION — documentation markup
                return 'DOCUMENTATION';
            case 'css':
                // STYLE — style (CSS) resource
                return 'STYLE';
            case 'evt':
                // EVENT — event definition
                return 'EVENT';
            case 'design':
                // DESIGN — design definition
                return 'DESIGN';
            case 'svg':
                // SVG — SVG graphic resource
                return 'SVG';
            case 'js':
                var fileNameEndsWith: string = fileName.replace(name, '').toLowerCase();
                if (fileNameEndsWith === 'controller') {
                    // CONTROLLER — client-side controller
                    return 'CONTROLLER';
                } else if (fileNameEndsWith === 'helper') {
                    // HELPER — client-side helper
                    return 'HELPER';
                } else if (fileNameEndsWith === 'renderer') {
                    // RENDERER — client-side renderer
                    return 'RENDERER';
                };
                break;
            default:
                throw `Unknown extension: ${extension} .`;
        }
        // Yet to be implemented
        // INTERFACE — interface definition
        // TOKENS — tokens collection
        // PROVIDER — reserved for future use
        // TESTSUITE — reserved for future use
        // MODEL — deprecated, do not use
    }*/
    function getAuraFormatFromDocument(doc: vscode.TextDocument) {
        // is 'js', 'css', or 'xml'
        switch (ext) {
            case 'js':
                return 'js';
            case 'css':
                return 'css';
            default:
                return 'xml';
        }
    }

    // =======================================================================================================================================
    // ================================                Lightning Web Components                    ===========================================
    // =======================================================================================================================================
    function getLWCBundle(svc) {
        return vscode.window.forceCode.conn.tooling.sobject('LightningComponentBundle').find({
            'DeveloperName': name, NamespacePrefix: vscode.window.forceCode.config.prefix || ''
        });
    }
    function ensureLWCBundle(results) {
        // If the Bundle doesn't exist, create it, else Do nothing
        return new Promise((resolve, reject) => {
        if (!results[0] || results[0].length === 0) {
            // Create Lightning Component Bundle
            return vscode.window.forceCode.conn.tooling.sobject('LightningComponentBundle').create({
                'FullName': name,
                'Metadata': { apiVersion: vscode.window.forceCode.version || vscode.window.forceCode.conn.version || 45.0 }
            }).then(bundle => {
                if (bundle.success) {
                    var b = { Id: bundle.id };
                    updateBundle(b)
                    .then(bundle => {
                        resolve([bundle]);
                    })
                }
            });
        } else {
            updateBundle(results[0])
            .then(bundle => {
                
                results[0] = bundle;
                resolve(results)
            })
        }
    })

        function updateBundle(bundle) {
            return new Promise((resolve, reject) => {
                if (Format === 'xml') {
                    let text: string = document.getText();

                    parseString(text, { explicitArray: false, async: false }, function (err, result) {
                        if (err) {
                            reject(err);
                        }
                        
                        let md = {}
                        let targetConfigsXml: string = null;

                        if (result.hasOwnProperty('LightningComponentBundle')) {                        
                            if (result.LightningComponentBundle.hasOwnProperty('targets')) {
                                if (!Array.isArray(result.LightningComponentBundle.targets.target)) {
                                    result.LightningComponentBundle.targets.target = [result.LightningComponentBundle.targets.target]
                                }
                                md['targets'] = result.LightningComponentBundle.targets;
                            } else {
                                md['targets'] = null
                            }

                            if (result.LightningComponentBundle.hasOwnProperty('isExposed')) {
                                md['isExposed'] = result.LightningComponentBundle.isExposed === 'true'
                            } else {
                                md['isExposed'] = false;
                            }

                            if (result.LightningComponentBundle.hasOwnProperty('isExplicitImport')) {
                                md['isExplicitImport'] = result.LightningComponentBundle.isExplicitImport === 'true'
                            } else {
                                md['isExplicitImport'] = false;
                            }
                            
                            if (result.LightningComponentBundle.hasOwnProperty('apiVersion')) {
                                md['apiVersion'] = Number(result.LightningComponentBundle.apiVersion)
                            } else {
                                md['apiVersion'] = 45.0
                            }
                            
                            if (result.LightningComponentBundle.hasOwnProperty('description')) {
                                md['description'] = result.LightningComponentBundle.description
                            } else {
                                md['description'] = null
                            }

                            if (result.LightningComponentBundle.hasOwnProperty('targetConfigs')) {
                                targetConfigsXml = text.substring(text.indexOf('<targetConfig'),
                                text.lastIndexOf('</targetConfig>') + '</targetConfig>'.length)
                                let xmlB64 = Buffer.from(targetConfigsXml).toString('base64')

                                md['targetConfigs'] = xmlB64
                            } else {
                                md['targetConfigs'] = Buffer.from("").toString('base64')
                            }

                        }

                        vscode.window.forceCode.conn.tooling.sobject('LightningComponentBundle').update({ 'Id': bundle.Id, Metadata: md })
                        .then(res => {
                           if (res.success) {
                               resolve(bundle)
                           } else {
                               reject(bundle)
                           }
                        }).catch(err => {
                            error.outputError(err, vscode.window.forceCode.outputChannel);
                            reject(err)
                        })
                    });
                } else {
                    resolve(bundle)
                }
            })
        }
    }
    function getLWCResource(svc, bundle) {
        return vscode.window.forceCode.conn.tooling.sobject('LightningComponentResource').find({
            'LightningComponentBundleId': bundle[0].Id
        });
    }
    function upsertLWCResource(resources, bundle) {
        // If the Resource doesn't exist, create it
        var res: any[] = resources.filter(result => result.Format === Format && result.FilePath === FilePath);
        currentObjectDefinition = res.length > 0 ? res[0] : undefined;
        if (currentObjectDefinition !== undefined) {
            LightningComponentBundleId = currentObjectDefinition.LightningComponentBundleId;
            Id = currentObjectDefinition.Id;
            return vscode.window.forceCode.conn.tooling.sobject('LightningComponentResource').update({ Id: currentObjectDefinition.Id, Source });
        } else if (bundle[0]) {
            return vscode.window.forceCode.conn.tooling.sobject('LightningComponentResource').create({ FilePath, LightningComponentBundleId: bundle[0].Id, Format, Source });
        }
    }
    function getLWCDefTypeFromDocument(doc: vscode.TextDocument) {
        var extension: string = ext.toLowerCase();
        switch (extension) {
            case 'html':
                return 'COMPONENT';
            case 'js':
                return 'CONTROLLER';
            case 'css':
                return 'STYLE';
            case 'json':
                return 'JSON';
            case 'svg':
                return 'SVG';
            case 'xml':
                return 'XML';
        }
    }
    function getLWCFormatFromDocument(doc: vscode.TextDocument) {
        // is 'js', 'css', or 'xml'
        switch (ext) {
            case 'js':
                return 'js';
            case 'css':
                return 'css';
            case 'html':
                return 'html';
            case 'json':
                return 'json';
            case 'svg':
                return 'svg';
            default:
                return 'xml';
        }
    }
    // =======================================================================================================================================
    // =================================  Tooling Objects (Class, Page, Component, Trigger)  =================================================
    // =======================================================================================================================================
    function addToContainer(svc: IForceService) {
        // We will push the filename on to the members array to make sure that the next time we compile, 
        var fc: IForceService = vscode.window.forceCode;
        var hasActiveContainer: Boolean = svc.containerId !== undefined;
        var fileIsOnlyMember: Boolean = (fc.containerMembers.length === 1) && fc.containerMembers.every(m => m.name === name);
        if (hasActiveContainer && fileIsOnlyMember) {
            // This is what happens when we had an error on the previous compile.  
            // We want to just update the member and try to compile again
            return updateMember(fc.containerMembers[0]);
        } else {
            // Otherwise, we create a new Container
            return svc.newContainer(true).then(() => {
                // Then Get the files info from the type, name, and prefix
                // Then Add the new member, updating the contents.
                return fc.conn.tooling.sobject(toolingType)
                    .find({ Name: fileName, NamespacePrefix: fc.config.prefix || '' }).execute()
                    .then(records => addMember(records));
            });
        }

        function updateMember(records) {
            var member: {} = {
                Body: body,
                Id: records.id,
            };
            return fc.conn.tooling.sobject(parsers.getToolingType(document, UPDATE)).update(member).then(res => {
                return fc;
            });
        }

        interface MetadataResult {
            ApiVersion: number;
            attributes: { type: string };
            Body: string;
            BodyCrc: number;
            CreatedById: string;
            CreatedDate: string;
            FullName: string;
            Id: string;
            IsValid: boolean;
            LastModifiedById: string;
            LastModifiedDate: string;
            LengthWithoutComments: number;
            ManageableState: string;
            Metadata: {};
            Name: string;
            NamespacePrefix: string;
            Status: string;
            SymbolTable: {};
            SystemModstamp: string;
        }
        function getWorkspaceMemberForMetadataResult(record: MetadataResult) {
            return fc.workspaceMembers ? fc.workspaceMembers.reduce((acc, member) => {
                if (acc) { return acc; }
                let namespaceMatch: boolean = member.memberInfo.namespacePrefix === record.NamespacePrefix;
                let nameMatch: boolean = member.name.toLowerCase() === record.Name.toLowerCase();
                let typeMatch: boolean = member.memberInfo.type === record.attributes.type;
                if (namespaceMatch && nameMatch && typeMatch) {
                    return member;
                }
            }, undefined) : undefined;
        }
        function shouldCompile(record) {
            let mem: forceCode.IWorkspaceMember = getWorkspaceMemberForMetadataResult(record);
            if (mem && record.LastModifiedById !== mem.memberInfo.lastModifiedById) {
                // throw up an alert
                return vscode.window.showWarningMessage('Someone else has changed this file!', 'Diff', 'Overwrite').then(s => {
                    if (s === 'Diff') {
                        diff(document, context);
                        return false;
                    }
                    if (s === 'Overwrite') {
                        return true;
                    }
                    return false;
                });
            } else if (!vscode.window.forceCode.apexMetadata) {
                // We don't have a workspace member for this file yet.  
                // We just booted and haven't retrieved it yet or something went wrong.
                return vscode.window.showWarningMessage('org_metadata not found', 'Save', 'Wait').then(s => {
                    if (s === 'Save') {
                        return true;
                    }
                    if (s === 'Wait') {
                        return false;
                    }
                    return false;
                });
            } else {
                return Promise.resolve(true);
            }

        }
        function addMember(records) {
            let md = {}
            
            if (fs.existsSync(`${document.fileName}-meta.xml`)) {
                var xmlMeta: string = fs.readFileSync(`${document.fileName}-meta.xml`, 'utf-8')
                parseString(xmlMeta, { explicitArray: false, async: false }, function (err, result) {
                    if (result.hasOwnProperty(toolingType)) {
                        delete result[toolingType]['$'];
                        delete result[toolingType]['_'];
                        md = result[toolingType]
                    }
                })
            }
            if (records.length > 0) {
                // Tooling Object already exists
                //  UPDATE it
                var record: MetadataResult = records[0];
                if (md !== {}) {
                    record.Metadata = md
                }
                // Get the modified date of the local file... 
                var member: {} = {
                    Body: body,
                    ContentEntityId: record.Id,
                    Id: fc.containerId,
                    Metadata: record.Metadata,
                    MetadataContainerId: fc.containerId,
                };
                return shouldCompile(record).then(should => {
                    if (should) {
                        return fc.conn.tooling.sobject(parsers.getToolingType(document, UPDATE)).create(member).then(res => {
                            fc.containerMembers.push({ name, id: res['id'] });
                            return fc;
                        });
                    } else {
                        throw { message: record.Name + ' not saved' };
                    }
                });
            } else {
                // Results was 0, meaning...
                // Tooling Object does not exist
                // so we CREATE it
                fc.statusBarItem.text = 'Creating ' + name;
                return fc.conn.tooling.sobject(parsers.getToolingType(document, CREATE)).create(createObject(body, md)).then(foo => {
                    return fc;
                });
            }
        }

        function createObject(text: string, metadata: {}): {} {
            if (toolingType === 'ApexClass') {
                return { Body: text, Metadata: metadata };
            } else if (toolingType === 'ApexTrigger') {
                let matches: RegExpExecArray = /\btrigger\b\s\w*\s\bon\b\s(\w*)\s\(/.exec(text);
                if (matches) {
                    return { Body: text, TableEnumOrId: matches[1], Metadata: metadata };
                } else {
                    throw { message: 'Could not get object name from Trigger' };
                }
            } else if (toolingType === 'ApexPage' || toolingType === 'ApexComponent') {
                return {
                    Markup: text,
                    Masterlabel: name + 'Label',
                    Name: name,
                    Metadata: metadata
                };
            }
            return { Body: text, Metadata: metadata };
        }
    }
    // =======================================================================================================================================
    function requestCompile() {
        return vscode.window.forceCode.conn.tooling.sobject('ContainerAsyncRequest').create({
            IsCheckOnly: false,
            IsRunTests: false,
            MetadataContainerId: vscode.window.forceCode.containerId,
        }).then(res => {
            vscode.window.forceCode.containerAsyncRequestId = res['id'];
            return vscode.window.forceCode;
        });
    }
    // =======================================================================================================================================
    function getCompileStatus(): Promise<any> {
        vscode.window.forceCode.statusBarItem.text = `${name} ${DefType ? DefType : ''}` + spinner();
        return nextStatus();
        function nextStatus() {
            checkCount += 1;
            // Set a timeout to auto fail the compile after 30 seconds
            return getStatus().then(res => {
                if (isFinished(res)) {
                    checkCount = 0;
                    clearInterval(interval);
                    return res;
                } else if (checkCount > 30) {
                    checkCount = 0;
                    clearInterval(interval);
                    throw { message: 'Timeout' };
                } else {
                    // Throttle the ReCheck of the compile status, to use fewer http requests (reduce effects on SFDC limits)
                    return sleep(vscode.window.forceCode.config.poll || 1000).then(nextStatus);
                }
            });
        }
        function getStatus(): Promise<any> {
            return vscode.window.forceCode.conn.tooling.query(`SELECT Id, MetadataContainerId, MetadataContainerMemberId, State, IsCheckOnly, ` +
                `DeployDetails, ErrorMsg FROM ContainerAsyncRequest WHERE Id='${vscode.window.forceCode.containerAsyncRequestId}'`);
        }
        function isFinished(res) {
            // Here, we're checking whether the Container Async Request, is Queued, or in some other state 
            if (res.records && res.records[0]) {
                if (res.records.some(record => record.State === 'Queued')) {
                    return false;
                } else {
                    // Completed, Failed, Invalidated, Error, Aborted
                    return true;
                }
            }
            // If we don't have a container request, then we should stop.
            return true;
        }
    }
    // =======================================================================================================================================
    function finished(res: any): boolean {
        // Create a diagnostic Collection for the current file.  Overwriting the last...
        var diagnostics: vscode.Diagnostic[] = [];
        if (res.records && res.records.length > 0) {
            res.records.filter(r => r.State !== 'Error').forEach(containerAsyncRequest => {
                containerAsyncRequest.DeployDetails.componentFailures.forEach(failure => {
                    // Create Red squiggly lines under the errors that came back
                    if (failure.problemType === 'Error') {
                        var failureLineNumber: number = Math.abs(failure.lineNumber || failure.LineNumber || 1);
                        var failureRange: vscode.Range = document.lineAt(failureLineNumber - 1).range;
                        if (failure.columnNumber > 0) {
                            failureRange = failureRange.with(new vscode.Position((failureLineNumber - 1), failure.columnNumber));
                        }
                        diagnostics.push(new vscode.Diagnostic(failureRange, failure.problem, failure.problemType));
                    }
                });
            });
        } else if (res.errors && res.errors.length > 0) {
            // We got an error with the container
            res.errors.forEach(err => {
                console.error(err);
            });
            vscode.window.forceCode.statusBarItem.text = `${name} ${DefType ? DefType : ''} $(alert)`;
        } else if (res.State === 'Error') {
            vscode.window.forceCode.statusBarItem.text = `${name} ${DefType ? DefType : ''} $(alert)`;
        }
        // TODO: Make the Success message derive from the componentSuccesses, maybe similar to above code for failures
        vscode.window.forceCode.diagnosticCollection.set(document.uri, diagnostics);
        if (diagnostics.length > 0) {
            // FAILURE !!! 
            vscode.window.forceCode.statusBarItem.text = `${name} ${DefType ? DefType : ''} $(alert)`;
            return false;
        } else {
            // SUCCESS !!! 
            vscode.window.forceCode.statusBarItem.text = `${name} ${DefType ? DefType : ''} $(check)`;
            return true;
        }
    }
    function containerFinished(createNewContainer: boolean): any {
        // We got some records in our response
        vscode.window.forceCode.isCompiling = false;
        return vscode.window.forceCode.newContainer(createNewContainer).then(res => {
            if (vscode.window.forceCode.queueCompile) {
                vscode.window.forceCode.queueCompile = false;
                return compile(document, context);
            }
        });
    }
    // =======================================================================================================================================
    function onError(err): any {
        if (toolingType === 'AuraDefinition') {
            return toolingError(err);
        } else if (toolingType === 'CustomObject' || toolingType === 'CustomLabels') {
            // Modify this if statement to check if any metadata type
            return metadataError(err);
        } else if (toolingType === 'LightningComponent') {
            return lwcError(err)
        } else {
            clearInterval(interval);
            error.outputError(err, vscode.window.forceCode.outputChannel);
        }
    }

    function lwcError(err): any {
        var diagnostics: vscode.Diagnostic[] = [];
        var splitString: string[] = err.message.split('\n');
        if (splitString.length > 1 && splitString[0] === "Compilation Failure") {
            var failurePos = splitString[1].match(/\d+,\d+/g)
            if (failurePos) {
                var failurePosTokens = failurePos[0].split(",")
                if (failurePosTokens.length == 2) {
                    var errorMessage = splitString[1].substring(splitString[1].indexOf('LWC'), splitString[1].lastIndexOf(':'));
                    var failureLineNumber: number = Number(failurePosTokens[0])
                    var failureColumnNumber: number = Number(failurePosTokens[1])
                    var failureRange: vscode.Range = document.lineAt(failureLineNumber - 1).range;
                    if (failureColumnNumber > 0) {
                        failureRange = failureRange.with(new vscode.Position((failureLineNumber - 1), failureColumnNumber));
                    }
                    diagnostics.push(new vscode.Diagnostic(failureRange, errorMessage, 0));
                    vscode.window.forceCode.diagnosticCollection.set(document.uri, diagnostics);
                }
            }
        } else {
            var failureRange: vscode.Range = document.lineAt(0).range;
            diagnostics.push(new vscode.Diagnostic(failureRange, err.message.substring(0, err.message.lastIndexOf(':')), 0));
            vscode.window.forceCode.diagnosticCollection.set(document.uri, diagnostics);
        }

        error.outputError({ message: err.message }, vscode.window.forceCode.outputChannel);

        return false;
    }

    function toolingError(err) {
        var diagnostics: vscode.Diagnostic[] = [];
        var splitString: string[] = err.message.split(fileName + ':');
        var partTwo: string = splitString.length > 1 ? splitString[1] : '1,1:Unknown error';
        var idx: number = partTwo.indexOf(':');
        var rangeArray: any[] = partTwo.substring(0, idx).split(',');
        var errorMessage: string = partTwo.substring(idx);
        var statusIdx: string = 'Message: ';
        var statusMessage: string = partTwo.substring(partTwo.indexOf(statusIdx) + statusIdx.length);
        var failureLineNumber: number = rangeArray[0];
        var failureColumnNumber: number = rangeArray[1];
        var failureRange: vscode.Range = document.lineAt(failureLineNumber - 1).range;
        if (failureColumnNumber > 0) {
            failureRange = failureRange.with(new vscode.Position((failureLineNumber - 1), failureColumnNumber));
        }
        diagnostics.push(new vscode.Diagnostic(failureRange, errorMessage, 0));
        vscode.window.forceCode.diagnosticCollection.set(document.uri, diagnostics);

        error.outputError({ message: statusMessage }, vscode.window.forceCode.outputChannel);
        return false;
    }
    function metadataError(err) {
        var diagnostics: vscode.Diagnostic[] = [];
        var errorInfo: string[] = err.message.split('\n');
        var line: number = errorInfo[1] ? Number(errorInfo[1].split('Line: ')[1]) : 1;
        var col: number = errorInfo[2] ? Number(errorInfo[2].split('Column: ')[1]) : 0;
        var failureRange: vscode.Range = document.lineAt(line).range;
        if (col > 0) {
            failureRange = failureRange.with(new vscode.Position((line), col));
        }
        diagnostics.push(new vscode.Diagnostic(failureRange, (errorInfo[0] || 'unknown error') + (errorInfo[3] || ''), 0));
        vscode.window.forceCode.diagnosticCollection.set(document.uri, diagnostics);

        error.outputError(err, vscode.window.forceCode.outputChannel);
        return false;

    }

    // =======================================================================================================================================
}

export function autoCompile(context: vscode.ExtensionContext): Promise<any> {
    return new Promise((resolve, reject) => {
        configuration().then(config => {
            resolve(getAutoCompile(config)
            .then(config => generateConfigFile(config)))
        })
        .catch(err => reject(err))
        
        function getAutoCompile(config: forceCode.Config) {
            let options: vscode.QuickPickItem[] = [{
                description: 'Automatically deploy/compile files on save',
                label: 'Yes',
            }, {
                description: 'Deploy/compile code through the ForceCode menu',
                label: 'No',
            },
            ];
            return vscode.window.showQuickPick(options, { ignoreFocusOut: true }).then((res: vscode.QuickPickItem) => {
                config.autoCompile = res.label === 'Yes';
                return config;
            });
        }
    })
}
