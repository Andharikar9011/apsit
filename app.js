const debug = require('debug')('backend-apsit:app.js');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const mysql = require('mysql2');
const helmet = require("helmet");
const compression = require("compression");
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bodyParser = require('body-parser');
const passport = require('passport');
const passportLocal = require('passport-local').Strategy;

// Required Routers
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
// const { countReset } = require('console');

// Variables Required
const app = express();
const ONE_DAY = 1000 * 60 * 60 * 24;
const hrs_2 = 1000 * 60 * 60 * 2;
const session_options = {
    expiration: ONE_DAY,
    checkExpirationInterval: hrs_2,
    createDatabaseTable: true,
    schema: {
        tableName: 'sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
};
try {
    debug("Trial");
    let pool = (process.env.db_ca && process.env.db_key && process.env.db_cert) ? mysql.createPool({
            host: process.env.db_host,
            user: process.env.db_user,
            password: process.env.db_password,
            database: process.env.db,
            ssl: {
                ca: process.env.db_ca,
                key: process.env.db_key,
                cert: process.env.db_cert
            },
            connectionLimit: 30
        }) :
        mysql.createPool({
            host: process.env.db_host,
            user: process.env.db_user,
            password: process.env.db_password,
            database: process.env.db
        });
    pool = pool.promise();
    const sessionStore = new MySQLStore(session_options, pool);

    
    // attach all the middleware
    app.use(compression());
    app.use(helmet());
    app.use(
        helmet.contentSecurityPolicy({
            directives: {
                defaultSrc: ["'self'", "'unsafe-inline'", "maxcdn.bootstrapcdn.com", "fonts.googleapis.com", "fonts.gstatic.com"],
                scriptSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com", "cdn.jsdelivr.net"],
                "style-src-elem": ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com", "maxcdn.bootstrapcdn.com", "cdn.jsdelivr.net", "fonts.googleapis.com"],
                "img-src": ["data:", "'self'"]
            },
        })
    );
    
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({
        extended: false
    }));
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, 'public')));
    
    if (app.get('env') === 'production') {
        app.set('trust proxy', 1) // trust first proxy
        // sess.cookie.secure = true // serve secure cookies
        // const csurf = require('csurf');
        // app.use(csurf);
        app.use(session({
            name: "cookie_id",
            secret: process.env.sessionSecret,
            resave: false,
            saveUninitialized: false,
            store: sessionStore,
            cookie: {
                maxAge: ONE_DAY,
                sameSite: true,
                secure: true,
                httpOnly: true
            },
            // unset: 'destroy',
            // rolling: true
        }));
    } else {
        const cors = require('cors');
        app.use(cors());
        app.use(session({
            name: "cookie_id",
            secret: process.env.sessionSecret,
            resave: false,
            saveUninitialized: false,
            store: sessionStore,
            cookie: {
                maxAge: ONE_DAY,
                sameSite: true,
                // secure: true,
                httpOnly: true
            },
            // unset: 'destroy',
            // rolling: true
        }));
    }
    app.use((req, res, next) => {
        req.db = pool;
        next();
    });


    passport.use(new passportLocal({
            usernameField: 'email',
            passwordField: 'password'
        },async function (email, givenPassword, done) {
            debug("LINE 20");
            debug(email, givenPassword);
            return pool.query('Select id, password, name, uType, isActive, isVerified, verificationCode from user where email = ?;', [email])
                .then(results => {
                    if (results[0].length > 0) {
                        const {
                            id,
                            password,
                            name,
                            uType,
                            isActive,
                            isVerified,
                            verificationCode
                        } = results[0][0];
                        if (password == givenPassword) {
                            console.log("Success");
                            done(null, {
                                id,
                                name,
                                uType,
                                isActive,
                                isVerified,
                                verificationCode
                            });
                        } else {
                            debug("Invalid Password");
                            done(null, false);
                        }
                    } else {
                        debug("Invalid Email");
                        done(null, false);
                    }
                })
                .catch(err => {
                    debug(err);
                    done(err);
                });
        }
    ));

    passport.serializeUser(function (user, done) {
        debug("LINE 153");
        done(null, user);
    });

    passport.deserializeUser(function (user, done) {
        debug("LINE 158");
        return done(null, user);

    });
    app.use(passport.initialize());
    app.use(passport.session());


    // app.use('/users',(req, res, next) => {if(req.isAuthenticated()){debug("IN /users while Authenticated");next();} else {debug("IN /users while UnAuthenticated"); res.redirect("/login");}}, usersRouter);
    app.use('/users', usersRouter);
    app.use('/', indexRouter);


} catch (e) {
    debug(e);
}
process.on('unhandledRejection', (reason) => {
    // I just caught an unhandled promise rejection,
    // since we already have fallback handler for unhandled errors (see below),
    // let throw and let him handle that
    debug(reason);
    return reason;
});
module.exports = app;