import * as vscode from 'vscode';
// import jsforce = require('jsforce');
import * as jsforce from 'jsforce';
import { FileProperties, Connection, UserInfo } from 'jsforce';
import { ApexClassCoverageTreeDataProvider } from './models/codeCoverage';

declare module 'vscode' {
    export namespace window {
        export let forceCode: IForceService;
    }
}

export interface Config {
    apiVersion?: string;
    autoCompile?: boolean;
    autoRefresh?: boolean;
    browser?: string;
    debugOnly?: boolean;
    debugFilter?: string;
    deployOptions?: {
        verbose?: boolean,
        checkOnly?: boolean
    };
    password?: string;
    poll?: number;
    pollTimeout?: number;
    prefix?: string;
    proxyUrl?: string;
    showTestCoverage? : boolean;
    showTestLog? : boolean;
    spaDist? : string;
    src?: string;
    url?: string;
    username?: string;
    orgs?: Org[];
    active?: number;
    instanceUrl?: string;
    // workspaceRoot?: string;
}

export interface Org {
    autoRefresh?: boolean;
    deployOptions?: {
        verbose?: boolean,
        checkOnly?: boolean
    };
    password?: string;
    prefix?: string;
    showTestCoverage? : boolean;
    showTestLog? : boolean;
    url?: string;
    username?: string;
    name?: string;
    instanceUrl?: string;
}

interface ILocationsNotCovered {
    column: Number;
    line: Number;
    numExecutions: Number;
    time: Number;
}

interface IWorkspaceMember {
    name: string;
    path: string;
    memberInfo: FileProperties;
}

export interface IWorkspaceService {
    getWorkspaceMembers: () => Promise<IWorkspaceMember[]>;
}

interface ICodeCoverage {
    dmlInfo: any[];
    id: string;
    locationsNotCovered: ILocationsNotCovered[];
    methodInfo: any[];
    name: string;
    namespace: string;
    numLocations: Number;
    numLocationsNotCovered: Number;
    soqlInfo: any[];
    soslInfo: any[];
    type: string;
    crc: number;
}

interface ICodeCoverageWarning {
    id: string;
    message: string;
    name: string;
    namespace: string;
}

interface IDeclarations {
    public?: any[],
    private?: any[],
    managed?: any[]
}

interface IContainerMember {
    name: string;
    id: string;
    entityId: string;
}

interface IMetadataObject {
    directoryName: string;
    inFolder: boolean;
    metaFile: boolean;
    suffix: string;
    xmlName: string;
    childXmlNames?: string[];
}

// export class ConnectionOptions {
//     oauth2?: any; // 	OAuth2 | Object	<optional> // OAuth2 instance or options to be passed to OAuth2 constructor
//     logLevel?: string; // 	String	<optional> // Output logging level (DEBUG|INFO|WARN|ERROR|FATAL)
//     version?: string; // 	String	<optional> // Salesforce API Version (without "v" prefix)
//     maxRequest?: number; // 	Number	<optional> // Max number of requests allowed in parallel call
//     loginUrl?: string; // 	String	<optional> // Salesforce Login Server URL (e.g. https://login.salesforce.com/)
//     instanceUrl?: string; // 	String	<optional> // Salesforce Instance URL (e.g. https://na1.salesforce.com/)
//     serverUrl?: string; // 	String	<optional> // Salesforce SOAP service endpoint URL (e.g. https://na1.salesforce.com/services/Soap/u/28.0)
//     accessToken?: string; // 	String	<optional> // Salesforce OAuth2 access token
//     sessionId?: string; // 	String	<optional> // Salesforce session ID
//     refreshToken?: string; // 	String	<optional> // Salesforce OAuth2 refresh token
//     signedRequest?: string; // 	String | Object	<optional> // Salesforce Canvas signed request (Raw Base64 string, JSON string, or deserialized JSON)
//     proxyUrl?: string; // 	String	<optional> // Cross-domain proxy server URL, used in browser client, non Visualforce app.
//     callOptions?: any; // 	Object	<optional> // Call options used in each SOAP/REST API request. See manual.
//   }

export interface IMetadataDescribe {
    metadataObjects: IMetadataObject[];
    organizationNamespace: string;
    partialSaveAllowed: boolean;
    testRequired: boolean;
}

export interface IForceService {
    operatingSystem?: string;
    config?: Config;
    workspaceRoot: string;
    completions?: vscode.CompletionItem[];
    describe: IMetadataDescribe;
    apexMetadata: FileProperties[];
    declarations?: IDeclarations;
    codeCoverage?: {};
    codeCoverageWarnings?: ICodeCoverageWarning[];
    // symbolTable?: any;
    containerId?: string;
    queueCompile?: boolean;
    isCompiling?: boolean;
    workspaceMembers: IWorkspaceMember[];
    containerMembers: IContainerMember[];
    containerAsyncRequestId?: string;
    conn?: Connection;
    userInfo?: UserInfo;
    isLoggedIn?: boolean;
    username?: string;
    url?: string;
    version?: string;
    outputChannel: vscode.OutputChannel;
    statusBarItem: vscode.StatusBarItem;
    currentOrgStatusBarItem: vscode.StatusBarItem;
    diagnosticCollection: vscode.DiagnosticCollection;
    codeCoverageTreeProvider: ApexClassCoverageTreeDataProvider;
    connect(): Promise<IForceService>;
    newContainer(force: Boolean): Promise<IForceService>;
    clearLog(): void;
    refreshApexMetadata(): Promise<any>;
    restUrl(): string;
}


export interface ForceCodeError {
    message: string;
}
