import * as vscode from 'vscode';

export function getIcon(toolingType: string) {
    switch (toolingType) {
        case 'ApexClass':
            return 'file-code';
        case 'ApexPage':
            return 'code';
        case 'ApexTrigger':
            return 'zap';
        case 'ApexComponent':
            return 'gist';
        case 'ApexLog':
            return 'bug';
        case 'CustomObject':
            return 'gist';
        default:
            return 'code';
    }
}
export function getFileExtension(document: vscode.TextDocument) {
    return getFileExtensionFromFilename(document.fileName);
}

export function getFileExtensionFromFilename(fileName: string) {
    var ext: string = fileName.substring(fileName.lastIndexOf('.') + 1, fileName.length);
    return ext;
}
export function getExtension(toolingType: string) {
    switch (toolingType) {
        case 'ApexClass':
            return 'cls';
        case 'ApexPage':
            return 'page';
        case 'ApexTrigger':
            return 'trigger';
        case 'ApexComponent':
            return 'component';
        case 'ApexLog':
            return 'log';
        case 'PermissionSet':
            return 'permissionset';
        case 'Controller':
        case 'Helper':
        case 'Renderer':
            return 'js';
        case 'Documentation':
            return 'auradoc';
        case 'Design':
            return 'design';
        case 'Svg':
            return 'svg';
        case 'Style':
            return 'css';
        case 'Component':
            return 'cmp';
        case 'Application':
            return 'app';
        case 'StaticResource':
            return 'resource';
        case 'AuraDefinitionBundle':
            return 'aura';
        default:
            throw toolingType + ' extension not defined';
    }
}
export function getFolder(toolingType: string) {
    switch (toolingType) {
        case 'ApexClass':
            return 'classes';
        case 'ApexPage':
            return 'pages';
        case 'ApexTrigger':
            return 'triggers';
        case 'ApexComponent':
            return 'components';
        case 'ApexLog':
            return 'logs';
        case 'PermissionSet':
            return 'permissionsets';
        default:
            return 'classes';
    }
}
