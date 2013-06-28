/************************************
 * Create a Contact "CLASS" from KnockoutForceObjectFactory by setting SOQL parameters.
 ***********************************/
var Contact = (function () {
    var objDesc = {
        type: 'Contact',
        fields: ['FirstName', 'LastName', 'Title', 'Phone', 'Email', 'Id', 'Account.Name'],
        where: '',
        orderBy: 'LastName',
        limit: 20
    };
    return KnockoutForceObjectFactory(objDesc, SFConfig);
})();

//Add any extra functions like validation functions to the Contact CLASS.
Contact.prototype.isValid = function () {
    if (!this.LastName() || this.LastName() == "") {
        return false;
    }
    return this.FirstName() != this._orig["FirstName"]
        || this.LastName() != this._orig["LastName"]
        || this.Title() != this._orig["Title"]
        || this.Email() != this._orig["Email"]
        || this.Phone() != this._orig["Phone"];
};

Contact.prototype.getAccount = function () {
    return this.Account && this.Account.Name ? this.Account.Name : '';
};


/*************************************************************
 * Create an "App" class to manage everything and start it
 *************************************************************/
function ContactsApp(SFconfig) {

    this.knockoutForce = new KnockoutForce(SFconfig);

    this.sammy = sammyRoutes(this);

    this.setViewModelByRoute = function (route, data) {
        switch (route) {
            case "/login"://fall-through
            case "/":
                this.currentViewModel = new LoginViewModel();
                break;
            case "/contacts":
                this.currentViewModel = new ContactListViewModel();
                break;
            case "/view":
                this.currentViewModel = new ContactViewModel(data);
                break;
            case "/edit":
                this.currentViewModel = new ContactEditViewModel(data);
                break;
        }
        return this.currentViewModel;
    }
}

//Start..
var contactsApp = new ContactsApp(SFConfig);
contactsApp.sammy.run();




/************************************
 * Create ViewModels for each route
 ***********************************/
function AppViewModel() {
    var self = this;
    self.isAuthenticated = ko.observable(SFConfig.client ? true : false);
    self.logout = function () {
        KnockoutForce.logout(function () {
            //Now go to logout page
            location.hash = '/logout';
        });
    }
}

function ContactEditViewModel(data) {
    var self = this;
    AppViewModel.call(self);
    self.contact = ko.observable(new Contact({}));
    if (data.id) {
        Contact.get({id: data.id}, function (contact, rawJSON) {
            self.original = contact;
            self.contact(new Contact(rawJSON));
        });
    }


    self.destroy = function () {
        self.original.destroy(
            function () {
                location.hash = '/contacts';
            },
            errCB
        );
    };

    self.save = function () {
        if (self.contact().Id) {
            self.contact().update(function () {
                location.hash = '/view/' + self.contact().Id;
            }, errCB);
        } else {
            Contact.save(self.contact(), function (contactObj) {
                location.hash = '/view/' + contactObj.Id || contactObj.id;
            }, errCB);
        }
    };

    self.cancel = function () {
        if (self.contact().Id) {
            location.hash = '/view/' + self.contact().Id;
        } else {
            location.hash = '/contacts/';
        }
    }
}


function LoginViewModel() {
    var self = this;
    AppViewModel.call(self);

    self.login = function () {
        contactsApp.knockoutForce.login(function () {
            location.hash = '/contacts';
        });
    };
}

function ContactViewModel(data) {
    var self = this;
    AppViewModel.call(self);
    self.contact = ko.observable(new Contact({}));
    Contact.get({id: data.id}, function (contact, rawJSON) {
        self.original = contact;
        self.contact(new Contact(rawJSON));
    });
}

function ContactListViewModel() {
    var self = this;
    AppViewModel.call(self);

    self.contacts = ko.observableArray([]);
    this.searchTerm = '';
    this.working = false;

    Contact.query(function (data) {
        self.formatAndSetContacts(data.records);

    }, errCB);

    self.formatAndSetContacts = function (dataArry) {
        //Note: Create custom fields for display (there are other ways, but this is simplest)
        var records = ko.utils.arrayMap(dataArry, function (record) {
            record.FullName = (record.FirstName ? record.FirstName + ' ' : ' ') + (record.LastName ? record.LastName : '');
            record.Company = record.Account && record.Account.Name ? record.Account.Name : '';
            record.viewUri = '#/view/' + record.Id;
            return record;
        });
        //Note: Don't use self.contacts= data.records coz self.contacts is an observableArray
        self.contacts.push.apply(self.contacts, records);
    };

    this.doSearch = function () {
        Contact.search(this.searchTerm, function (records) {
            if (records.length > 0) {
                self.contacts.removeAll();//remove original items
                self.formatAndSetContacts(records);
            } else {
                alert("Item Not Found");
            }

        }, errCB);
    };

    this.doView = function (contactObj) {
        location.hash = '/view/' + contactObj.Id;
    };

    this.doCreate = function () {
        $location.path('/new');
    }
}

//helper errCB
function errCB(jqXHR, textStatus, errorThrown) {
    alert(jqXHR.status + " " + errorThrown);
}
