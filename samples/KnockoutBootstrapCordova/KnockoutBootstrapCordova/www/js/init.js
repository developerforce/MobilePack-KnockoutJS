/**
 * Initialize SFConfig
 */
var SFConfig = getSFConfig();

function initApp(options, forcetkClient) {
    options = options || {};
    options.loginUrl = SFConfig.sfLoginURL;
    options.clientId = SFConfig.consumerKey;
    options.apiVersion = 'v27.0';
    options.userAgent = 'SalesforceMobileUI/alpha';
    options.proxyUrl = options.proxyUrl || SFConfig.proxyUrl;

    //In VF, you should get sessionId and use that as accessToken while initializing forcetk(Force.init)
    if (SFConfig.sessionId) {
        options.accessToken = SFConfig.sessionId;
    }

    //Init force
    Force.init(options, options.apiVersion, forcetkClient);

    //sforce.connection.init(options.accessToken, options.instanceUrl + '/services/Soap/u/' + options.apiVersion, options.useProxy);
    if (navigator.smartstore) {
        SFConfig.dataStore = new Force.StoreCache('sobjects', [{
                path: 'Name',
                type: 'string'
            }, {
                path: 'attributes.type',
                type: 'string'
            }
        ], 'Id');

        SFConfig.dataStore.init();
    }
}


var contactsApp;

//Start..
function bootstrapKnockoutApp(options, forcetkClient) {
    var contactsApp = new ContactsApp(SFConfig);

    initApp(options);
    contactsApp.sammy.run();
}

/**
 *  KnockoutJS doesn't provide "Routes" for single-page apps. This function creates "Routes" for the app using SammyJS
 *  framework (http://sammyjs.org/). SammyJS is completely different from KnockoutJS but only provides "Routes" that could be
 *  used by other frameworks and is popular among KnockoutJS folks.
 *
 * @param koApp KnockoutJS app
 * @returns {*} a Sammy object
 */

function sammyRoutes(koApp) {
    //Note: SammyJS needs absolute path (for cordova). 
    var absolutePath = document.location.href.substr(0, document.location.href.lastIndexOf('/'));

    var sammyApp = Sammy(function() {
        this.get('/login', function() {
            this.render('/partials/login.html').replace('#mainContainer');
            koApp.setViewModelByRoute("/login");
        });

        this.get('/callback:cbInfo', function() {
            koApp.knockoutForce.oauthCallback(document.location.href);
            location.hash = '/contacts';
        });

        //Go to Contacts list for index.html or / or /contacts paths 
        // - this assumes we are ALREADY logged in and are hitting index.html or / 
        this.get('index.html', showContacts);
        this.get('/', showContacts);
        this.get('/contacts', showContacts);

        function showContacts() {
            if (!koApp.knockoutForce.authenticated()) {
                location.hash = '/login';
            } else {
                koApp.setViewModelByRoute("/contacts");
                this.render(absolutePath + '/partials/contact/list.html').replace('#mainContainer');
            }
        };

        this.get('/view/:id', function() {
            if (!koApp.knockoutForce.authenticated()) {
                location.hash = '/login';
            } else {
                koApp.setViewModelByRoute("/view", {
                    id: this.params.id
                });
                this.render(absolutePath + '/partials/contact/view.html').replace('#mainContainer');
            }
        });

        this.get('/edit/:id', function() {
            if (!koApp.knockoutForce.authenticated()) {
                location.hash = '/login';
            } else {
                koApp.setViewModelByRoute("/edit", {
                    id: this.params.id
                });
                this.render(absolutePath + '/partials/contact/edit.html').replace('#mainContainer');
            }
        });

        this.get('/new', function() {
            if (!koApp.knockoutForce.authenticated()) {
                location.hash = '/login';
            } else {
                koApp.setViewModelByRoute("/edit", {});
                this.render(absolutePath + '/partials/contact/edit.html').replace('#mainContainer');
            }
        });

        this.get('/logout', function() {
            this.render(absolutePath + '/partials/logout.html').replace('#mainContainer');
        });


        //Note: bind to 'changed' event and reapply bindings if mainContainer has changed
        //This is required to essentially wait until new view is swapped before applying bindings.
        this.bind('changed', function () {
            if (!koApp.currentViewModel) {
                return;
            }
            var mainContainer = document.getElementById('mainContainer');
            var logoutDiv = document.getElementById('logoutDiv');

            if (mainContainer && mainContainer.childNodes.length > 0) {
                ko.cleanNode(logoutDiv);
                ko.cleanNode(mainContainer);
                ko.applyBindings(koApp.currentViewModel, mainContainer);
                ko.applyBindings(koApp.currentViewModel, logoutDiv);
            }
        });
    });
    return sammyApp;
}


/**
 * Please configure Salesforce consumerkey, proxyUrl etc in getSFConfig().
 *
 * SFConfig is a central configuration JS Object. It is used by angular-force.js and also your app to set and retrieve
 * various configuration or authentication related information.
 *
 * Note: Please configure SFConfig Salesforce consumerkey, proxyUrl etc in getSFConfig() below.
 *
 * @property SFConfig Salesforce Config object with the following properties.
 * @attribute {String} sfLoginURL       Salesforce login url
 * @attribute {String} consumerKey      Salesforce app's consumer key
 * @attribute {String} oAuthCallbackURL OAuth Callback URL. Note: If you are running on Heroku or elsewhere you need to set this.
 * @attribute {String} proxyUrl         URL to proxy cross-domain calls. Note: This nodejs app acts as a proxy server as well at <location>/proxy/
 * @attribute {String} client           ForcetkClient. Set by forcetk lib
 * @attribute {String} sessionId        Session Id. Set by forcetk lib
 * @attribute {String} apiVersion       REST Api version. Set by forcetk (Set this manually for visualforce)
 * @attribute {String} instanceUrl      Your Org. specific url. Set by forcetk.
 *
 * @returns SFConfig object depending on where (localhost v/s heroku v/s visualforce) the app is running.
 */

function getSFConfig() {
    var location = document.location;
    var href = location.href;
    if (href.indexOf('file:') >= 0) { //Phonegap
        return {};
    } else if (configFromEnv && configFromEnv.sessionId) { //VisualForce just sets sessionId (as that's all what is required)
        return {
            sessionId: configFromEnv.sessionId
        }
    } else {
        if (!configFromEnv || configFromEnv.client_id == "" || configFromEnv.client_id == "undefined" || configFromEnv.app_url == "" || configFromEnv.app_url == "undefined") {
            throw 'Environment variable client_id and/or app_url is missing. Please set them before you start the app';
        }
        return {
            sfLoginURL: 'https://login.salesforce.com/',
            consumerKey: configFromEnv.client_id,
            oAuthCallbackURL: removeTrailingSlash(configFromEnv.app_url) + '/#/callback',
            proxyUrl: removeTrailingSlash(configFromEnv.app_url) + '/proxy/'
        }
    }
}

//Helper

function removeTrailingSlash(url) {
    return url.replace(/\/$/, "");
}