/**
 * KnockoutForce library provides glue b/w Knockout.js and Saleforce's forcetk libraries to help easily build
 * KnockoutJS based Salesforce apps.
 *
 * It contains the following two Knockout Modules.
 * 1. KnockoutForce - Helps with authentication with Salesforce
 * 2. KnockoutForceObjectFactory - Creates & returns different kind of KnockoutForceObject class based on the params.
 *
 * @author Raja Rao DV @rajaraodv
 */


/**
 * KnockoutForce Module helps with authentication with Salesforce. It internally depends on Cordova(Phonegap apps) and
 * forcetk.ui(web apps) to do so.
 *
 * @param SFConfig An KnockoutJS object that is used to store forcetk.client.
 */

function KnockoutForce(SFConfig) {

    this.inVisualforce = document.location.href.indexOf('visual.force.com') > 0;

    this.authenticated = function() {
        //by the time we call this in cordova app is already authenticated
        if (location.protocol === 'file:' && cordova) {
            return true;
        }
        return SFConfig.client ? true : false;
    };

    this.login = function(callback) {
        if (SFConfig.client) { //already logged in
            return callback && callback();
        }

        if (location.protocol === 'file:' && cordova) { //Cordova / PhoneGap
            return this.setCordovaLoginCred(callback);
        } else if (SFConfig.inVisualforce) { //visualforce
            return this.loginVF();
        } else { //standalone / heroku / localhost
            return this.loginWeb(callback);
        }
    };

    /**
     *  setCordovaLoginCred initializes forcetk client in Cordova/PhoneGap apps (not web apps).
     *  Usage: Import KnockoutForce module into your initial view and call KnockoutForce.setCordovaLoginCred
     *
     *  Note: This should be used when SalesForce *native-phonegap* plugin is used for logging in to SF
     */
    this.setCordovaLoginCred = function(callback) {
        if (!cordova) throw 'Cordova/PhoneGap not found.';

        //Call getAuthCredentials to get the initial session credentials
        cordova.require("salesforce/plugin/oauth").getAuthCredentials(salesforceSessionRefreshed, getAuthCredentialsError);

        //register to receive notifications when autoRefreshOnForeground refreshes the sfdc session
        document.addEventListener("salesforceSessionRefresh", salesforceSessionRefreshed, false);

        function salesforceSessionRefreshed(creds) {
            // Depending on how we come into this method, `creds` may be callback data from the auth
            // plugin, or an event fired from the plugin.  The data is different between the two.
            var credsData = creds;
            if (creds.data) // Event sets the `data` object with the auth data.
                credsData = creds.data;

            SFConfig.client = new forcetk.Client(credsData.clientId, credsData.loginUrl);
            SFConfig.client.setSessionToken(credsData.accessToken, apiVersion, credsData.instanceUrl);
            SFConfig.client.setRefreshToken(credsData.refreshToken);
            callback();
        }

        function getAuthCredentialsError(error) {
            logToConsole("getAuthCredentialsError: " + error);
        }
    };

    /**
     * Login using forcetk.ui (for non phonegap/cordova apps)
     * Usage: Import KnockoutForce and call KnockoutForce.login(callback)
     * @param callback A callback function (usually in the same controller that initiated login)
     */
    this.loginWeb = function(callback) {
        if (!SFConfig) throw 'Must set app.SFConfig where app is your KnockoutJS app';

        if (SFConfig.client) { //already loggedin
            return callback && callback();
        }
        var ftkClientUI = getForceTKClientUI(callback);
        ftkClientUI.login();
    };

    /**
     * Login to VF. Technically, you are already logged in when running the app, but we need this function
     * to set sessionId to SFConfig.client (forcetkClient)
     *
     * Usage: Import KnockoutForce and call KnockoutForce.login() while running in VF page.
     *
     * @param callback A callback function (usually in the same controller that initiated login)
     */
    this.loginVF = function() {
        SFConfig.client = new forcetk.Client();
        SFConfig.client.setSessionToken(SFConfig.sessionId);
    };


    this.oauthCallback = function(callbackString) {
        var ftkClientUI = getForceTKClientUI();
        ftkClientUI.oauthCallback(callbackString);
    };

    KnockoutForce.logout = function(callback) {
        if (SFConfig.client) {
            var ftkClientUI = getForceTKClientUI();
            ftkClientUI.client = SFConfig.client;
            ftkClientUI.instanceUrl = SFConfig.client.instanceUrl;
            ftkClientUI.proxyUrl = SFConfig.client.proxyUrl;
            ftkClientUI.logout(callback);

            //set SFConfig.client to null
            SFConfig.client = null;
        }
    };

    /**
     * Creates a forcetk.clientUI object using information from SFConfig. Please set SFConfig information
     * in init.js (or via environment variables).
     *
     * @returns {forcetk.ClientUI}
     */

    function getForceTKClientUI(callback) {
        return new forcetk.ClientUI(SFConfig.sfLoginURL, SFConfig.consumerKey, SFConfig.oAuthCallbackURL, function forceOAuthUI_successHandler(forcetkClient) {
            console.log('OAuth callback success!');
            SFConfig.client = forcetkClient;
            SFConfig.client.serviceURL = forcetkClient.instanceUrl + '/services/data/' + forcetkClient.apiVersion;

            initApp(null, forcetkClient);

            //Set sessionID to KnockoutForce coz profileImages need them
            self.sessionId = SFConfig.client.sessionId;

            //If callback is passed, call it
            callback && callback();
        }, function forceOAuthUI_errorHandler() {
            alert('oauth failed');
        },
            SFConfig.proxyUrl);
    }
}

/**
 * KnockoutForceObjectFactory creates & returns different kind of KnockoutForceObject class based on the params.
 * Usage: Import KnockoutForceObjectFactory and pass params.
 * Where params are:
 * @params  type    String  An SF object type like: 'Opportunity', 'Contact' etc
 * @param   fields  Array An array of fields
 * @param   where   A SOQL Where clause for the object like 'Where IsWon = TRUE'
 *
 * var MySFObject = KnockoutForceObjectFactory({params})
 *
 
 */

function KnockoutForceObjectFactory(params, sfConfig) {
    params = params || {};
    var type = params.type;
    var fields = params.fields;
    var where = params.where;
    var limit = params.limit;
    var orderBy = params.orderBy;
    var fieldsArray = $.isArray(params.fields) ? params.fields : [];

    var isOnline = function() {
        return navigator.onLine ||
            (typeof navigator.connection != 'undefined' &&
            navigator.connection.type !== Connection.UNKNOWN &&
            navigator.connection.type !== Connection.NONE);
    };

    var SFConfig = sfConfig;

    //Make it soql compliant
    fields = fields && fields.length > 0 ? fields.join(', ') : '';
    where = where && where != '' ? ' where ' + where : '';
    limit = limit && limit != '' ? ' LIMIT ' + limit : 'LIMIT 25';
    orderBy = orderBy && orderBy != '' ? ' ORDER BY ' + orderBy : '';

    //Construct SOQL
    var soql = 'SELECT ' + fields + ' FROM ' + type + where + orderBy + limit;

    //Construct SOSL
    // Note: "__SEARCH_TERM_PLACEHOLDER__" will be replaced by actual search query just before making that query
    var sosl = 'Find {__SEARCH_TERM_PLACEHOLDER__*} IN ALL FIELDS RETURNING ' + type + ' (' + fields + ')';

    /**
     * KnockoutForceObject acts like a super-class for actual SF Objects. It provides wrapper to forcetk ajax apis
     * like update, destroy, query, get etc.
     * @param props JSON representing a single SF Object
     *
     * Usage:
     * 1. First import KnockoutForceObjectFactory into your KnockoutJS main app-module.
     *
     * 2. Create an SF Object Class from the factory like this:
     *      var Opportunity = KnockoutForceObjectFactory({type: 'Opportunity', fields: ['Name', 'CloseDate', 'Id'], where: 'WHERE IsWon = TRUE'});
     *
     * 3. Create actual object by passing JSON from DB like this:
     *      var myOpp = new Opportunity({fields: {'Name': 'Big Opportunity', 'CloseDate': '2013-03-03', 'Id': '12312'});
     */

    function KnockoutForceObject(props) {
        props = props || {};
        copyToMe(props, this);

        this._orig = props || {};
    }

    function copyToMe(obj, dest) {

        fieldsArray.forEach(function(prop) {
            try {
                if (prop.indexOf(".") > 0) {
                    dest[prop] = deepCopy(prop, dest, obj);
                } else if (prop == "Id") {
                    dest[prop] = obj[prop];
                } else {
                    dest[prop] = ko.observable(obj[prop]);
                }
            } catch (e) {

            }

        });
    }

    function deepCopy(str, ref, copyFromObj) {

        var arry = str.split(".");
        var obj = [];

        var priorName;

        function helper(name, ref, copyFromObj) {
            ref[name] = copyFromObj[name];
        }

        for (var i = 0; i < arry.length; i++) {
            helper(arry[i], ref[priorName] || ref, copyFromObj[priorName] || copyFromObj);
            priorName = arry[i];
        }
        return obj;
    }

    /************************************
     * CRUD operations
     ************************************/
    KnockoutForceObject.prototype.update = function(successCB, failureCB) {
        return KnockoutForceObject.update(this, successCB, failureCB);
    };


    KnockoutForceObject.prototype.destroy = function(successCB, failureCB) {
        return KnockoutForceObject.remove(this, successCB, failureCB);
    };

    KnockoutForceObject.query = function(successCB, failureCB) {
        return KnockoutForceObject.queryWithCustomSOQL(soql, successCB, failureCB);
    };

    KnockoutForceObject.queryWithCustomSOQL = function(soql, successCB, failureCB) {
        var self = this;
        var config = {};

        // fetch list from forcetk and populate SOBject model
        if (isOnline()) {
            config.type = 'soql';
            config.query = soql;

        } else if (navigator.smartstore) {
            config.type = 'cache';
            config.cacheQuery = navigator.smartstore.buildExactQuerySpec('attributes.type', type);
        }

        Force.fetchSObjects(config, SFConfig.dataStore).done(function(resp) {
            var processFetchResult = function(records) {
                //Recursively get records until no more records or maxListSize
                if (resp.hasMore() && (SFConfig.maxListSize || 25) > resp.records.length) {
                    resp.getMore().done(processFetchResult);

                } else {
                    return successCB(resp);
                }
            }
            processFetchResult(resp.records);

        }).fail(failureCB);
    };

    /*RSC And who doesn't love SOSL*/
    KnockoutForceObject.search = function(searchTerm, successCB, failureCB) {
        //Replace __SEARCH_TERM_PLACEHOLDER__ from SOSL with actual search term.
        var s = sosl.replace('__SEARCH_TERM_PLACEHOLDER__', escape(searchTerm));
        return SFConfig.client.search(s, successCB, failureCB);
    };


    KnockoutForceObject.get = function(params, successCB, failureCB) {
        //        return SFConfig.client.retrieve(type, params.id, fieldsArray, function (data) {
        //            return successCB(new KnockoutForceObject(data), data);
        //        }, failureCB);
        return Force.syncSObject('read', type, params.id, null, fieldsArray, SFConfig.dataStore, isOnline() ? Force.CACHE_MODE.SERVER_FIRST : Force.CACHE_MODE.CACHE_ONLY)
            .done(function(rawJSON) {
            return successCB(new KnockoutForceObject(rawJSON), rawJSON);
        }).fail(failureCB);
    };

    KnockoutForceObject.save = function(obj, successCB, failureCB) {
        var data = KnockoutForceObject.getNewObjectData(obj);
        //        return SFConfig.client.create(type, data, function (data) {
        //            if (data && !$.isArray(data)) {
        //                //Salesforce returns "id" in lowercase when an object is
        //                //created. Where as it returns id as "Id" for every other call.
        //                // This might confuse people, so change "id" to "Id".
        //                if (data.id) {
        //                    data.Id = data.id;
        //                    delete data.id;
        //                }
        //                return successCB(new KnockoutForceObject(data))
        //            }
        //            return successCB(data);
        //        }, failureCB);

        return Force.syncSObject('create', type, null, data, fieldsArray, SFConfig.dataStore, isOnline() ? Force.CACHE_MODE.SERVER_FIRST : Force.CACHE_MODE.CACHE_ONLY)
            .done(function(data) {
            return successCB(new KnockoutForceObject(data));
        }).fail(failureCB);
    };

    KnockoutForceObject.update = function(obj, successCB, failureCB) {
        var changedData = KnockoutForceObject.getChangedData(obj);

        //        return SFConfig.client.update(type, obj.Id, data, function (data) {
        //            if (data && !$.isArray(data)) {
        //                return successCB(new KnockoutForceObject(data))
        //            }
        //            return successCB(data);
        //        }, failureCB);

        return Force.syncSObject('update', type, obj.Id, changedData, _.keys(changedData), SFConfig.dataStore, isOnline() ? Force.CACHE_MODE.SERVER_FIRST : Force.CACHE_MODE.CACHE_ONLY)
            .done(function(data) {
            return successCB(new KnockoutForceObject(data));
        }).fail(failureCB);
    };

    KnockoutForceObject.remove = function(obj, successCB, failureCB) {
        // return SFConfig.client.del(type, obj.Id, successCB, failureCB);
        return Force.syncSObject('delete', type, obj.Id, null, null, SFConfig.dataStore, isOnline() ? Force.CACHE_MODE.SERVER_FIRST : Force.CACHE_MODE.CACHE_ONLY)
            .done(function(data) {
            return successCB(new KnockoutForceObject(data));
        }).fail(failureCB);
    };

    /************************************
     * HELPERS
     ************************************/
    KnockoutForceObject.getChangedData = function(obj) {
        var diff = {};
        var orig = obj._orig;
        if (!orig) return {};
        fieldsArray.forEach(function(field) {
            var currentVal = typeof(obj[field]) == 'function' ? obj[field]() : null;
            if (currentVal && currentVal !== orig[field]) {
                diff[field] = currentVal;
            }
        });
        return diff;
    };

    KnockoutForceObject.getNewObjectData = function(obj) {
        var newObj = {};
        fieldsArray.forEach(function(field) {
            if (field != 'Id' && field.indexOf(".") == -1) {
                newObj[field] = obj[field]();
            }
        });
        return newObj;
    };

    return KnockoutForceObject;
}