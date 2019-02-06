import * as vscode from 'vscode';
import * as path from 'path';
import { getFileExtension, getFileExtensionFromFilename } from './open';
import { getToolingType } from '.';

export default function getName(document: vscode.TextDocument, toolingType: string): string {
    if (toolingType === 'ApexClass') {
        return getNameFromClassBody(document);
    } else if (toolingType === 'AuraDefinition') {
      return getAuraNameFromFileName(document.fileName);
    } else if (toolingType === 'LightningComponent') {
      return getLWCNameFromFileName(document.fileName);
    }
    return getFileName(document);
}
export function getFileName(document: vscode.TextDocument) {
   return getFileName2(document.fileName);
}
export function getFileName2(fn: string) {
    var fileName: string = fn.substring(0, fn.lastIndexOf('.'));
    var fileNameArray: string[] = fileName.split(path.sep);
    // give me the last one, giving me just the fileName
    fileName = fileNameArray[fileNameArray.length - 1];
    return fileName;
}
export function getWholeFileName(document: vscode.TextDocument) {
    var fileNameArray: string[] = document.fileName.split(path.sep);
    // give me the last one, giving me just the fileName
    var fileName: string = fileNameArray[fileNameArray.length - 1];
    return fileName;
}
function getNameFromClassBody(document: vscode.TextDocument): string {
    var fileNameArray: string[] = getFileName(document).split(path.sep);
    var fileName: string = fileNameArray[fileNameArray.length - 1];
    var bodyParts: string[] = document.getText().split(/(extends|implements|\{)/);
    var firstLine: string = bodyParts.length && bodyParts[0];
    var words: string[] = firstLine.trim().split(' ');
    var className: string = words.length && words[words.length - 1];
    if (fileName !== className) {
        return fileName;
    }
    return className;
}
export function getAuraNameFromFileName(fileName: string): string {
    return fileName.split(`${vscode.window.forceCode.config.src}${path.sep}aura${path.sep}`).pop().split(path.sep).shift();
}

export function getLWCNameFromFileName(fileName: string): string {
    return fileName.split(`${vscode.window.forceCode.config.src}${path.sep}lwc${path.sep}`).pop().split(path.sep).shift();
}

export function getComponentName(document: vscode.TextDocument) {
    var fileNameArray: string[] = document.fileName.split(path.sep);
    // give me the last one, giving me just the fileName
    var fileName: string = fileNameArray[fileNameArray.length - 2];
    return fileName;
}

export function getAuraDefTypeFromFilename(fileName: string) {
    const extension: string = getFileExtensionFromFilename(fileName);
    const fn: string = getFileName2(fileName);
    const name: string = getAuraNameFromFileName(fileName);
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
            var fileNameEndsWith: string = fn.replace(name, '').toLowerCase();
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
}

export function getAuraDefTypeFromDocument(doc: vscode.TextDocument) {
    return getAuraDefTypeFromFilename(doc.fileName)
}
