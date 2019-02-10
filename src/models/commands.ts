export default {
    // Enter Salesforce Credentials
    dx : {
        description: 'Salesforce DX Commands',
        detail: 'DX',
        icon: 'broadcast',
        label: 'Salesforce DX',
    },
    // Enter Salesforce Credentials
    manageCredentials : {
        description: 'Manage credentials and switch between orgs.',
        detail: 'You can either add, modify, delete or switch to an org.',
        icon: 'key',
        label: 'Manage Credentials',
    },
    // Execute Anonymous 
    // Execute Selected Code
    executeAnonymous: {
        description: 'Execute code and get the debug log',
        detail: 'If you have a block of text selected, it will run that, otherwise it will use the text of the active file.',
        icon: 'terminal',
        label: 'Execute Anonymous',
    },
    // Compile/Deploy
    compileDeploy: {
        description: 'Save the active file to your org.',
        detail: 'If there is an error, you will get notified. To automatically compile Salesforce files on save, set the autoCompile flag to true in your settings file',
        icon: 'rocket',
        label: 'Compile/Deploy',
    },
    autoCompile: {
        description: "Enable / Disable deploy on save",
        detail: 'Change the deploy method of metadata when is saved in the IDE',
        icon: 'cloud-upload',
        label: "Auto Deploy",
    },
    // Export Package (Deploy via Metadata API, using Package.xml)
    deployPackage: {
        description: 'Deploy your package.',
        detail: 'If you have a directory with a package.xml, you will get the option to deploy it.',
        icon: 'package',
        label: 'Deploy Package',
    },
    // Retrieve Package
    retrievePackage: {
        description: 'Retrieve metadata to your src directory.',
        detail: 'You will be prompted for the package name or you can choose to retrieve by your package.xml or to retrieve all metadata',
        icon: 'cloud-download',
        label: 'Retrieve Package/Metadata',
    },
    // Get Log(s)
    getLogs: {
        description: 'Display a list of the last ten logs.',
        detail: 'Get recent logs',
        icon: 'unfold',
        label: 'Get Logs',
    },
    // Open File
    openFile: {
        description: 'Open Classes, Pages, Triggers, and Components',
        detail: 'Open a file from the cloud (aka "refresh from org").',
        icon: 'desktop-download',
        label: 'Open Salesforce File',
    },
    // Build/Deploy Resource Bundle(s)
    resourceBundle: {
        description: 'Build and Deploy a resource bundle.',
        detail: 'Create the Static Resource from the resource-bundle folder and deploy it to your org.',
        icon: 'file-zip',
        label: 'Build Resource Bundle',
    },
    create: {
        description: 'Create a new compiled object.',
        detail: 'Supported objects are Class, Trigger, Apex Page, Apex Component and Aura / Lightning Web Component',
        icon: 'plus',
        label: 'Create',
    },
    // Create Classes
    createClass: {
        description: 'Create a new class',
        detail: 'A class is a template or blueprint from which objects are created. An object is an instance of a class',
        icon: 'code',
        label: 'Apex Class',
    },
    createTrigger: {
        description: 'Create a new trigger',
        detail: 'Apex triggers enable you to perform custom actions before or after changes to records',
        icon: 'zap',
        label: 'Apex Trigger',
    },
    createApexPage: {
        description: 'Create a new Visualforce Page',
        detail: 'A Visualforce page is similar to a standard Web page',
        icon: 'file-text',
        label: 'Visualforce',
    },
    createApexComponent: {
        description: 'Create a new Visualforce Component',
        detail: 'Visualforce components are small, reusable pieces of functionality used in Visualforce pages',
        icon: 'file-code',
        label: 'Visualforce Component',
    },
    createAuraComponent: {
        description: 'Create a new Aura Component',
        detail: 'Aura components are the self-contained and reusable units of an app',
        icon: 'code',
        label: 'Aura Component', 
    },
    createLwc: {
        description: 'Create a Lightning Web Component',
        detail: 'Lightning web components are custom HTML elements built using HTML and modern JavaScript',  
        icon: 'code',
        label: 'Lightning Web Component',
    },
    // Run current Unit tests
    runUnitTests: {
        description: 'Run the Unit Tests for this Test Class',
        detail: 'If the Apex class you currently have open contains test methods, it will run the test methods and return the results in the output panel',
        icon: 'beaker',
        label: 'Run Unit Tests',
    },
    // Run SOQL
    soql: {
        description: 'Run a SOQL query',
        detail: 'The SOQL query results will be dumped to a json file in the soql directory',
        icon: 'telescope',
        label: 'SOQL Query',
    },
    // Run Tooling Query
    toql: {
        description: 'Run a Tooling API query',
        detail: 'The Tooling API query (Select SymbolTable From ApexClass) results will be dumped to a json file in the toql directory',
        icon: 'telescope',
        label: 'Tooling Query',
    },
    // Run SOQL
    package: {
        description: 'Generate Package.xml file from the contents of a directory',
        detail: 'Generate a Package.xml file for a directory',
        icon: 'gift',
        label: 'Package-xml',
    },
    // Diff Files
    diff: {
        description: 'Diff the current file with what is on the server',
        detail: 'Diff the file',
        icon: 'diff',
        label: 'Diff',
    },
}
