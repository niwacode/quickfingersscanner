import { Slack } from './slack';
import { Binance } from './exchanges/binance.exchange';
import { Poloniex } from './exchanges/poloniex.exchange';
import { Bittrex } from './exchanges/bittrex.exchange';
import { HitBtc } from './exchanges/hitbtc.exchange';
import { Ticker } from './ticker';
const vorpal = require('vorpal');

import {Exchange} from './exchange';
import {CurrencyPair} from './currencypair';
var fs = require('fs');

var hitbtc = new HitBtc();
var bittrex = new Bittrex();
var poloniex = new Poloniex();
var binance = new Binance();
var slackkey = "";

// Check if a file exists
var FileExists = (filePath: string) : boolean => {
	try{
		fs.statSync(filePath);
	}catch(err){
		if(err.code == 'ENOENT') return false;
	}
	return true;
}

// Print current settings
var PrintSettings = () => {
    console.log(`
    Ignorehours: ${CurrencyPair.ignorehours}
    Mindrop: ${CurrencyPair.mindrop}
    Minhours: ${CurrencyPair.minhours}
    Maxbottomdist: ${CurrencyPair.maxbottomdistance}
    Maxskipcandles: ${CurrencyPair.maxskipcandles}
    Ignorenewer: ${CurrencyPair.ignoreNewer}
    UseSlack: ${CurrencyPair.useSlack}
    SlackKey: ${slackkey}`);
}

// Read settings for this currency pair. The settings are the slack thread id and whether to ignore the currency pair (in case of delisting etc)
var ReadSettings = () => {
    let settingsFile = './data/scanner.settings.json';
    if(FileExists(settingsFile)) {
        let settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        if(settings.ignoreHours)
            CurrencyPair.ignorehours = settings.ignoreHours;
        if(settings.minDrop)
            CurrencyPair.mindrop = settings.minDrop;
        if(settings.minHours)
            CurrencyPair.minhours = settings.minHours;
        if(settings.maxBottomDist)
            CurrencyPair.maxbottomdistance = settings.maxBottomDist;
        if(settings.maxSkipCandles)
            CurrencyPair.maxskipcandles = settings.maxSkipCandles;
        if(settings.ignoreNewer)
            CurrencyPair.ignoreNewer = settings.ignoreNewer;
        if(settings.useSlack)
            CurrencyPair.useSlack = settings.useSlack;
        if(settings.slackKey)
            slackkey = settings.slackKey;
    }
}

// Write settings to file
var WriteSettings = () => {
    let settingsFile = './data/scanner.settings.json';
    let settings = {
        ignoreHours: CurrencyPair.ignorehours,
        minDrop: CurrencyPair.mindrop,
        minHours: CurrencyPair.minhours,
        maxBottomDist: CurrencyPair.maxbottomdistance,
        maxSkipCandles: CurrencyPair.maxskipcandles,
        ignoreNewer: CurrencyPair.ignoreNewer,
        useSlack: CurrencyPair.useSlack,
        slackKey: slackkey
    };
    fs.writeFileSync(settingsFile, JSON.stringify(settings), 'utf8');
}

ReadSettings();
if(slackkey && slackkey.length > 0)
    Slack.setKey(slackkey);
// Download history for one exchange at a time to avoid high load on Coinigy servers
// Start subscribing to HitBTC ticker, 1000ms refresh rate
//hitbtc.TickerTimer(1000);
// Get all currency pairs on HitBTC and download history
//hitbtc.GetCurrencyPairs(() => {
//    console.log("HitBTC history downloaded");
    // Start subscribing to BitTrex ticker
    bittrex.TickerTimer(1000);
    // Get all currency pairs on BitTrex and download history
    bittrex.GetCurrencyPairs(() => {
        console.log("BitTrex history downloaded");
        // Start subscribing to Poloniex ticker
        poloniex.TickerTimer(1000);
        // Get all currenct pairs on Poloniex and download history
        poloniex.GetCurrencyPairs(() => {
            console.log("Poloniex history downloaded");
            // Start subscribing to Binance ticker
            binance.TickerTimer(1000);
            binance.GetCurrencyPairs(() => {
                console.log("Binance history downloaded");            
            });
        });            
    }); 
//});


// Set up vorpal CLI
var cli = vorpal().delimiter('crypto-cli~$');
cli.command('ignorehours <hours>').description('Ignore last <hours> hours when looking for a drop.').action((a,cb) => {
    CurrencyPair.ignorehours = a.hours;
    console.log(`Ignoring last ${a.hours} hours\n`);
    PrintSettings();
    cb();
});

cli.command('mindrop <pc>').description('Minimum drop below last low.').action((a,cb) => {
    CurrencyPair.mindrop = a.pc;
    console.log(`Minimum drop set to ${a.pc}%\n`);
    PrintSettings();
    cb();
});
cli.command('minhours <hours>').description('Minimum time since last low.').action((a, cb) => {
    CurrencyPair.minhours = a.hours;
    console.log(`Minimum time set to ${a.hours} hours\n`);
    PrintSettings();
    cb();
});
cli.command('maxbottomdist <pc>').description('Maximum distance below previous low.').action((a, cb) => {
    CurrencyPair.maxbottomdistance = a.pc;
    console.log(`Maximum bottom distance set to ${a.pc}%\n`);
    PrintSettings();
    cb();
});

cli.command('maxskipcandles <candles>').description('Maximum number of higher candles to skip when tracking bottom.').action((a, cb) => {
    CurrencyPair.maxskipcandles = a.candles;
    console.log(`Maximum skip candles set to ${a.candles}\n`);
    PrintSettings();
    cb();
});

cli.command('ignorenewer <hours>').description('Number of hours to ignore newer bases after finding an older base.').action((a, cb) => {
    CurrencyPair.ignoreNewer = a.hours;
    console.log(`Number of hours set to ${a.hours}\n`);
    PrintSettings();
    cb();
});

cli.command('slack <use>').description('Send alerts to Slack').action((a, cb) => {
    CurrencyPair.useSlack = a.use;
    console.log('Sending to Slack ' + (CurrencyPair.useSlack?"enabled":"disabled"));
    PrintSettings();
    cb();
});

cli.command('slackkey <key>').description('Slack api key').action((a, cb) => {
    slackkey = a.key;
    Slack.setKey(slackkey);

    console.log('Setting Slack key to ' + a.key);
    PrintSettings();
    cb();
});

cli.command('save').description('Save settings').action((a, cb) => {
    WriteSettings();
    console.log('Setting saved');
    cb();
});


// Rescan all charts by resetting last-values. Will trigger new alerts. Used after changing settings.
cli.command('rescan').description('Rescan all charts.').action((a, cb) => {
    bittrex.currencyPairs.forEach(x => {
        x.lastLowerTime = 0;
        x.lastDropState = false;
        x.lastCurrentLow = 0;
        x.lastBaseCandle = null;
    });

    hitbtc.currencyPairs.forEach(x => {
        x.lastLowerTime = 0;
        x.lastDropState = false;
        x.lastCurrentLow = 0;
        x.lastBaseCandle = null;
    });

    poloniex.currencyPairs.forEach(x => {
        x.lastLowerTime = 0;
        x.lastDropState = false;
        x.lastCurrentLow = 0;
        x.lastBaseCandle = null;
    });

    binance.currencyPairs.forEach(x => {
        x.lastLowerTime = 0;
        x.lastDropState = false;
        x.lastCurrentLow = 0;
        x.lastBaseCandle = null;
    });

    cb();
});

cli.command('settings').description('Show current settings.').action((a, cb) => {
    PrintSettings();
    cb();
});

cli.command('pairdata').description('Show data for all pairs.').action((a, cb) => {
    console.log('\n\nBitTrex\n\n');
    bittrex.currencyPairs.forEach(x => {
        console.log(`${x.base_curr}/${x.primary_curr} LastLowerTime: ${x.lastLowerTime}, LastDropState: ${x.lastDropState}, LastCurrentLow: ${x.lastCurrentLow}, LastBaseCandle: ${x.lastBaseCandle?JSON.stringify(x.lastBaseCandle):"null"}`);
    });

    console.log('\n\nHitBtc\n\n');
    hitbtc.currencyPairs.forEach(x => {
        console.log(`${x.base_curr}/${x.primary_curr} LastLowerTime: ${x.lastLowerTime}, LastDropState: ${x.lastDropState}, LastCurrentLow: ${x.lastCurrentLow}, LastBaseCandle: ${x.lastBaseCandle?JSON.stringify(x.lastBaseCandle):"null"}`);
    });

    console.log('\n\nPoloniex\n\n');
    poloniex.currencyPairs.forEach(x => {
        console.log(`${x.base_curr}/${x.primary_curr} LastLowerTime: ${x.lastLowerTime}, LastDropState: ${x.lastDropState}, LastCurrentLow: ${x.lastCurrentLow}, LastBaseCandle: ${x.lastBaseCandle?JSON.stringify(x.lastBaseCandle):"null"}`);
    });

    console.log('\n\nBinance\n\n');
    binance.currencyPairs.forEach(x => {
        console.log(`${x.base_curr}/${x.primary_curr} LastLowerTime: ${x.lastLowerTime}, LastDropState: ${x.lastDropState}, LastCurrentLow: ${x.lastCurrentLow}, LastBaseCandle: ${x.lastBaseCandle?JSON.stringify(x.lastBaseCandle):"null"}`);
    });

    cb();

});

cli.command('ignore <exchange> <curr1> <curr2>').description("Don't alert for currency pair").action((a, cb) => {
    let exchange: Exchange = null;
    switch(a.exchange.toLowerCase()) {
        case 'plnx':
            exchange = poloniex;
            break;
        case 'btrx':
            exchange = bittrex;
            break;
        case 'bina':
            exchange = binance;
            break;
    }
    if(exchange) {
        let pairs = exchange.currencyPairs.filter(x => (x.base_curr.toLowerCase() == a.curr1.toLowerCase() && x.primary_curr.toLowerCase() == a.curr2.toLowerCase()) || (x.base_curr.toLowerCase() == a.curr2.toLowerCase() && x.primary_curr.toLowerCase() == a.curr1.toLowerCase()));
        pairs.forEach(x => {
            x.SetIgnore(true);
        });        
        if(pairs.length == 0) {
            console.log('Currency pair not found');
        }
    } else {
        console.log('Invalid exchange code');
    }
    cb();
});

cli.command('unignore <exchange> <curr1> <curr2>').description("Stop ignoring currency pair").action((a, cb) => {
    let exchange: Exchange = null;
    switch(a.exchange.toLowerCase()) {
        case 'plnx':
            exchange = poloniex;
            break;
        case 'btrx':
            exchange = bittrex;
            break;
        case 'bina':
            exchange = binance;
            break;
    }
    if(exchange) {
        let pairs = exchange.currencyPairs.filter(x => (x.base_curr.toLowerCase() == a.curr1.toLowerCase() && x.primary_curr.toLowerCase() == a.curr2.toLowerCase()) || (x.base_curr.toLowerCase() == a.curr2.toLowerCase() && x.primary_curr.toLowerCase() == a.curr1.toLowerCase()));
        pairs.forEach(x => {
            x.SetIgnore(false);
        });        
        if(pairs.length == 0) {
            console.log('Currency pair not found');
        }
    } else {
        console.log('Invalid exchange code');
    }
    cb();
});


cli.command('stats').description('Print statistics.').action((a, cb) => {
    console.log('Number of currency pairs:');
    
    console.log('Bittrex: ' + bittrex.currencyPairs.length);
    console.log('HitBTC: ' + hitbtc.currencyPairs.length);
    console.log('Poloniex: ' + poloniex.currencyPairs.length);
    console.log('Binance: ' + binance.currencyPairs.length);    
    let btrx1h = 0;
    let btrx1m = 0;
    bittrex.currencyPairs.forEach(x => {
        btrx1h += x.candles_1h.length; 
        btrx1m += x.candles_1m.length;
    });

    let hitb1h = 0;
    let hitb1m = 0;
    hitbtc.currencyPairs.forEach(x => {
        hitb1h += x.candles_1h.length;
        hitb1m += x.candles_1m.length;
    });

    let plnx1h = 0;
    let plnx1m = 0;
    poloniex.currencyPairs.forEach(x => {
        plnx1h += x.candles_1h.length;
        plnx1m += x.candles_1m.length;
    });

    let bina1h = 0;
    let bina1m = 0;
    binance.currencyPairs.forEach(x => {
        bina1h += x.candles_1h.length;
        bina1m += x.candles_1m.length;
    });

    console.log('\nNumber of 1h candles: ');
    console.log('Bittrex: ' + btrx1h);
    console.log('HitBTC: ' + hitb1h);
    console.log('Poloniex: ' + plnx1h);
    console.log('Binance: ' + bina1h);

    console.log('\nNumber of 1m candles: ');
    console.log('Bittrex: ' + btrx1m);
    console.log('HitBTC: ' + hitb1m);
    console.log('Poloniex: ' + plnx1m);
    console.log('Binance: ' + bina1m);

    cb();
});


cli.show();
