import { RenderChart } from './renderchart';
var request = require('request');
import { CandleStick } from './candlestick';
import { Exchange } from './exchange';
import { Ticker } from './ticker';
//const player = require('play-sound')();
var fs = require('fs');
import { Slack } from './slack';
var masterCurrencies = ['USD', 'USDT', 'EUR', 'BTC', 'ETH'];  //'XMR'   
var slackCurrencyGroup = {'BTC': 'BTC', 'ETH': 'ETH', 'USD': 'Fiat', 'EUR': 'Fiat', 'USDT': 'Fiat'}
var slackThreadCurrency = {'BTC': 'BTC', 'ETH': 'ETH', 'USD': 'USD', 'EUR': 'EUR', 'USDT': 'USD'}

export class CurrencyPair
{
    static slack = new Slack();
    
    // Maximum number of 1h candles to keep
    static max1hcandles = 24*60;
    // Array of minute candlesticks for last two hours
    candles_1m: Array<CandleStick> = new Array<CandleStick>();
    // Array of hour candlesticks for last two months
    candles_1h: Array<CandleStick> = new Array<CandleStick>();
    // Remember if last ticker triggered an alert with the same base time, prevent duplicate alerts
    lastDropState = false;
    lastLowerTime: number = 0;
    lastBaseCandle: CandleStick = null;
    // Last base and primary currency volume
    base_volume: number;
    primary_volume: number;
    // Time when a base was last found. Ignore newer bases for <ignorenewer> hours.
    lastBaseFoundTime = 0;
    // Holds master and secondary currencies: { curr1: master, curr2: secondary }
    masterCurrency = null;
    // Holds the name of the slack group
    slackGroup = null;
    // Settings
    // Minimum drop from base before alerting
    static mindrop: number = 5;
    // Maximum distance to candle when searching for bases
    static maxbottomdistance = 8;
    // Minimum time since last base
    static minhours: number = 72;
    // Ignore last x hours when searching for a base
    static ignorehours: number = 12;
    // Maximum candles with higher body than the first candle found on the current base. Used when searching for bottom of base
    static maxskipcandles = 8;
    // Send to telegram channel
    static useSlack = false;
    // Number of hours to ignore newer bases than the last one that was found
    static ignoreNewer = 2;
    // Slack thread id
    threadId = null;
    // Ignore this currency pair, use for delisted pairs etc.
    ignore = false;
    // When the last tick was received
    last_tick_time: number;
    
    constructor(public primary_curr: string, public base_curr: string, public exchange: Exchange) {
        // Check if an least one of the currencies is a "master currency"
        this.masterCurrency = this.FindMasterCurrency(primary_curr, base_curr);
        // If the currency pair contains a master currency, find the correct slack group and read the settings
        if(this.masterCurrency) {
            this.slackGroup = ('scanner_alerts_' + slackCurrencyGroup[this.masterCurrency.curr1]).toLowerCase();
            this.ReadSettings();
        }
    }

    // Find out if the currency pair contains at least one master currency, and order the currencies so the strongest one comes first
    private FindMasterCurrency(curr1, curr2) {
        let curr1index = masterCurrencies.indexOf(curr1);
        let curr2index = masterCurrencies.indexOf(curr2);
        
        if(curr1index < 0)
            curr1index = 999; // Not a master currency
        if(curr2index < 0)
            curr2index = 999; // Not a master currency
    
        if(curr1index == 999 && curr2index == 999)
        {
            console.log(curr1 + '/' + curr2 + ' No master currency');
            return null;
        }
        else if(curr1index < curr2index) {
            return {curr1: curr1, curr2: curr2};
        }
        else {
            return {curr1: curr2, curr2: curr1};
        }
    }
    
    // Read settings for this currency pair. The settings are the slack thread id and whether to ignore the currency pair (in case of delisting etc)
    private ReadSettings() {
        let settingsFile = './data/'+slackThreadCurrency[this.masterCurrency.curr1]+'_'+this.masterCurrency.curr2+'.settings.json';
        if(this.FileExists(settingsFile)) {
            let settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
            if(settings.threadId)
                this.threadId = settings.threadId;
            if(settings.ignore)
                this.ignore = settings.ignore;
        }
    }

    // Select if the currency pair should be ignored (never alert)
    SetIgnore(value: boolean) {
        this.ignore = value;
        this.WriteSettings();
        if(value)
            console.log('Ignoring ' + this.exchange.exch_code + ' ' + this.base_curr + ' ' + this.primary_curr);
        else
            console.log('No longer ignoring ' + this.exchange.exch_code + ' ' + this.base_curr + ' ' + this.primary_curr);
    }

    // Write settings to file
    private WriteSettings() {
        let settingsFile = './data/'+slackThreadCurrency[this.masterCurrency.curr1]+'_'+this.masterCurrency.curr2+'.settings.json';
        let settings = {threadId: this.threadId, ignore: this.ignore};
        fs.writeFileSync(settingsFile, JSON.stringify(settings), 'utf8');
    }

    // Check if a file exists
    private FileExists(filePath: string) : boolean {
        try{
            fs.statSync(filePath);
        }catch(err){
            if(err.code == 'ENOENT') return false;
        }
        return true;
    }

    // Get history from Coinigy
    public GetHistory(callback : ()=>void) {
        let historyfile = './data/'+this.exchange.exch_code+'_'+this.base_curr+'_'+this.primary_curr+'.json';
        // Calculate current unix timestamp
        let unixtime = Math.round(+new Date()/1000);
        // Unix timestamp one hour ago. Will get minute candles for last hour.
        let fromtime_1m = unixtime - 3600;
        // Unix timestamp 60 days ago. Will get hour candlesticks for last two months.
        let fromtime_1h = unixtime - 3600*CurrencyPair.max1hcandles;
        // Url for minute candles for desired time range
        let url1m = `https://www.coinigy.com/getjson/chart_feed/${this.exchange.exch_code}/${this.primary_curr}/${this.base_curr}/1/${fromtime_1m}/${unixtime}`;
        // Get minute candles from coinigy
        request(url1m, (err, res, body) => {
            if (!err && res.statusCode == 200) {
                JSON.parse(body).forEach(x => {
                    let c = new CandleStick();
                    c.start_time = x[0];
                    c.open = x[1];
                    c.high = x[2];
                    c.low = x[3];
                    c.close = x[4];
                    this.candles_1m.push(c);
                });
                
                // Read history from JSON file, if exists
                if(this.FileExists(historyfile)) {
                    let history = JSON.parse(fs.readFileSync(historyfile, 'utf8')).filter((x:CandleStick) => x.start_time > fromtime_1h);
                    history.forEach(x => {
                        let c = new CandleStick();
                        c.start_time = x.start_time;
                        c.close = x.close;
                        c.high = x.high;
                        c.low = x.low;
                        c.open = x.open;
                        
                        this.candles_1h.push(c);
                    });
                    if(this.candles_1h.length > 0)
                        this.candles_1h.shift();

                    if(this.candles_1h.length > 0)
                        fromtime_1h = this.candles_1h[0].start_time + 3600;
                }

                // Url for 1 hour candles
                let url1h = `https://www.coinigy.com/getjson/chart_feed/${this.exchange.exch_code}/${this.primary_curr}/${this.base_curr}/60/${fromtime_1h}/${unixtime}`;
                // Get (newer) hour candles from coinigy
                request(url1h, (err, res, body) => {
                    if (!err && res.statusCode == 200) {
                        let newCandles = new Array<CandleStick>();

                        JSON.parse(body).forEach(x => {
                            let c = new CandleStick();
                            c.start_time = x[0];
                            c.open = x[1];
                            c.high = x[2];
                            c.low = x[3];
                            c.close = x[4];
                            newCandles.push(c);
                        });

                        this.candles_1h = newCandles.concat(this.candles_1h);
                        // Write history to JSON file
                        fs.writeFileSync(historyfile, JSON.stringify(this.candles_1h), 'utf8');
                        // Finished getting history for this coin
                        callback();                        
                    } else {
                        // Error getting 1 hour candles
                        console.log(err);
                    }
                });                
            } else {
                // Error getting 1 minute candles
                console.log(err);
            }
        });                


    }

    // Get Coinigy url for this currency pair
    GetCoinigyUrl() : string {
        return `https://www.coinigy.com/main/markets/${this.exchange.exch_code}/${this.primary_curr}/${this.base_curr}`;
    }

    // Find the first base, don't look for bases for the last <ignoreHours> hours
    FindBase(value: number, ignoreHours: number) : CandleStick {
        // First candle found with low value lower than <maxbottomdistance> above <value>
        let firstCandle: CandleStick = null;
        // Lowest candle body found
        let lowestCandle: CandleStick = null;
        // Current candle number, 0 is newest
        let i: number = 0;
        // Discovery state. 0: Looking for candle with low value < maxbottomdistance. 1: Looking for bottom of base
        let state: number = 0;
        // Number of consecutive candles with body low > lowest candle body low
        let skippedCandles = 0;

        // Iterate through the hourly candles back in time
        for (let x of this.candles_1h) {
            // For the first candles, only check if they are higher than the current price, not if they are bases. If a candle is lower that the current price, stop looking.
            if(i < ignoreHours) {
                if(value > x.low) {
                    lowestCandle = x;
                    break;
                }
            } // State 0 - look for a candle that is < maxbottomdistance above current price.
            else if(state == 0 && x.bodylow() <= (value * (1+CurrencyPair.maxbottomdistance/100)) && i >= ignoreHours) {
                firstCandle = x;
                lowestCandle = firstCandle;
                state = 1;
            } else if (state == 1) { // State 1 - Try to find the bottom of the wave
                if(x.bodylow() <= firstCandle.bodylow()) { // The price must be lower than the candle found in state 0
                    if(x.bodylow() < lowestCandle.bodylow()) { // Check if this is the lowest candle so far
                        lowestCandle = x;
                    }
                    skippedCandles = 0;
                } else { // A candle was found above the candle found in state 0, allow only <maxskipcandles> consecutive higher candles
                    skippedCandles++;
                    if(skippedCandles > CurrencyPair.maxskipcandles) { // If too many higher candles was found, stop looking. We have found the bottom.
                        break;
                    }
                }
            }
            i++;
        }
        return lowestCandle;
    }

    // Find the lowest price in a given period, looks a little buggy
    GetLow(start_time: number, end_time: number) : number {
        let low:number = -1;
        let last_candle_start = Math.floor(end_time/3600)*3600;
        this.candles_1h.filter(x => x.start_time >= start_time && x.start_time < last_candle_start).forEach(y => {
            if(low > 0 || y.low < low) // This is probably a bug, should be low < 0
                low = y.low;
        })
        let lastCandle = this.GetCandleForTime(last_candle_start, end_time); // Calculate the last 1h candle from 1m candles. Only applicable if end_time is within the last hour.
        if(lastCandle && (lastCandle.low < low || low < 0))
            low = lastCandle.low;

        return low;
    }

    // Calculate a candle between to timestamps from 1m candles
    GetCandleForTime(start_time: number, end_time: number) : CandleStick {
        if(this.candles_1m.length == 0)
            return null;
        let cs1h = new CandleStick();
        cs1h.close = this.candles_1m[0].close;
        cs1h.high = this.candles_1m[0].high;
        cs1h.low = this.candles_1m[0].low;
        cs1h.open = this.candles_1m[0].open;
        cs1h.start_time = start_time;
        let c_1m = this.candles_1m.filter(x => x.start_time >= cs1h.start_time && x.start_time < end_time);
        c_1m.forEach(y => {
            cs1h.open = y.open;
            cs1h.high = Math.max(cs1h.high, y.high);
            cs1h.low = Math.min(cs1h.low, y.low);
        });
        return cs1h;
    }

    // New tick received from exchange, perform calculations
    NewTick(ticker: Ticker) {
        // Cancel if currency pair is set to be ignored.
        if(this.ignore)
            return;

        let unix = ticker.tick_time;
        this.base_volume = ticker.base_volume_24;
        this.primary_volume = ticker.primary_volume_24;

        // Add a new candle to the 1h array if a new hour has started or this is the first tick received
        if(!this.last_tick_time || Math.floor(unix/3600) != Math.floor(this.last_tick_time/3600)) {
            let cs = this.GetCandleForTime(Math.floor(unix/3600)*3600, unix);
            if(!cs) cs = new CandleStick();
            cs.open = ticker.last_price;
            cs.high = ticker.last_price;
            cs.low = ticker.last_price;
            cs.start_time = Math.floor(unix/3600)*3600; // Calculate exact start time of this hour
            this.candles_1h.unshift(cs);
            this.candles_1h = this.candles_1h.filter(x => x.start_time > unix-3600*24*60); // Remove candles more than 60 days old
        }

        // Add a new candle to the 1m array if a new minute has started or this is the first tick received
        if(!this.last_tick_time || Math.floor(unix/60) != Math.floor(this.last_tick_time/60)) {
            let cs = new CandleStick();
            cs.open = ticker.last_price;
            cs.high = ticker.last_price;
            cs.low = ticker.last_price;
            cs.start_time = Math.floor(unix/60)*60; // Calculate exact start time of this minute
            this.candles_1m.unshift(cs);
            this.candles_1m = this.candles_1m.filter(x => x.start_time > unix-3600); // Remove candles more than 1h old     
            this.lastCurrentLow = 0;
        }

        // If the 1h array contains at least one candle, update high, low and close-prices
        if(this.candles_1h.length > 0 && this.candles_1h[0]) {
            this.candles_1h[0].high = Math.max(this.candles_1h[0].high, ticker.last_price);
            this.candles_1h[0].low = Math.min(this.candles_1h[0].low, ticker.last_price);
            this.candles_1h[0].close = ticker.last_price;
        } else { // We should have at least one candle, something is wrong
            console.log(`1h candle missing in ${this.exchange}: ${this.base_curr}-${this.primary_curr}`);
        }

        // If the 1m array contains at least one candle, update high, low and close-prices
        if(this.candles_1m.length > 0 && this.candles_1m[0]) {
            this.candles_1m[0].high = Math.max(this.candles_1m[0].high, ticker.last_price);
            this.candles_1m[0].low = Math.min(this.candles_1m[0].low, ticker.last_price);
            this.candles_1m[0].close = ticker.last_price;
        } else { // We should have at least one candle, something is wrong
            console.log(`1m candle missing in ${this.exchange}: ${this.base_curr}-${this.primary_curr}`);
        }
        this.last_tick_time = unix;

        // Check if price has dropped below a base
        this.CheckDrop();
    };

    // Used when running the scanner locally, to give a sound when an alert is issued
    PlaySound() {
/*        player.play('./ting.mp3', (err) => {
            if (err) console.log(`Could not play sound: ${err}`);
        });*/
    }

    // Create a graph using techan charts
    CreateGraphic(fromCandle: number, baseCandle: number, base: number, title: string, message: string, value: number) {
        let r = new RenderChart();
        let basestart = Math.min(this.candles_1h.length-1, baseCandle);
        let baseend = 0;

        // Create a unique filename for the chart
        let filename = this.exchange.exch_code + " " + this.base_curr + "_" + this.primary_curr + " " + +new Date()+".png";

        // If slack is enabled and there is a group for this pair, send an alert
        if(CurrencyPair.useSlack && this.slackGroup) {
            console.log('Rendering...');
            r.render(this.candles_1h.slice(0, fromCandle), value, {FromTime: new Date(this.candles_1h[baseend].start_time*1000), ToTime: new Date(this.candles_1h[basestart].start_time*1000), Level: base}, filename, this.exchange.exch_code + " " + this.base_curr + "_" + this.primary_curr, (file) => {
                console.log('Render complete, sending slack message');
                let url = 'http://quickfingers.trade/alerts/' + file;
                CurrencyPair.slack.send(this.slackGroup, url, title, message, this.threadId, (ts) => {
                    // If a new thread was created, save the thread id
                    if(this.threadId != ts)
                    {
                        this.threadId = ts;
                        this.WriteSettings();
                    }
                });
            });
        }
    }

    lastCurrentLow = 0;

    // Check if the price has dropped below the base
    CheckDrop() {
        // Only check if there is at least one 1m candle, should always be true
        if(this.candles_1m.length > 0) {
            // Find the low value of the current candle, only check if the price is different from last time
            let currentLow = this.candles_1m[0].low;
            if(currentLow != this.lastCurrentLow) {
                this.lastCurrentLow = currentLow;
                let unix = Math.round(+new Date()/1000);

                // Find the closest base
                let baseCandle = this.FindBase(currentLow, CurrencyPair.ignorehours);
                if(baseCandle) { // If a base was found
                    // Continue if there wasn't found a base candle last time, if this base is older than the last one found or if it's more than <ignoreNewer> hours since the last base was found
                    if (!this.lastBaseCandle || baseCandle.start_time < this.lastBaseCandle.start_time || (unix-this.lastBaseFoundTime) > CurrencyPair.ignoreNewer*3600) {
                        let timeSinceLastLow = Math.floor((unix - baseCandle.start_time) / 3600);
                        // Alert if the base is at least <minddrop> % above current price, at least <minhours> hours old and isn't the same base that was alerted last time
                        if((baseCandle.bodylow() > currentLow * (1+CurrencyPair.mindrop/100)) && timeSinceLastLow > CurrencyPair.minhours && baseCandle.start_time != this.lastLowerTime) {
                            let title = `(${this.exchange.exch_code}) ${this.primary_curr}/${this.base_curr}`;
                            let message = 
`Last base: ${timeSinceLastLow}h ago
Volume: ${Math.round(this.base_volume*100)/100} ${this.base_curr} / ${Math.round(this.primary_volume*100)/100} ${this.primary_curr}
Price: ${this.candles_1m[0].close}
${this.GetCoinigyUrl()}
${this.exchange.GetUrl(this.primary_curr, this.base_curr)}`

                            this.lastLowerTime = baseCandle.start_time;
                            this.lastBaseCandle = baseCandle;
                            this.lastBaseFoundTime = unix;
                            this.PlaySound();
                            // Create the graph and send to slack
                            this.CreateGraphic(this.candles_1h.length-24, this.candles_1h.indexOf(baseCandle), baseCandle.bodylow(), title, message, currentLow);
                        }
                    }
                }
                // Alert if the current price is the lowest price in 60 days (maximum length of the array)
                else if (this.candles_1h.length > CurrencyPair.minhours) {
                    if(this.lastLowerTime != -999) {
                        let title = `(${this.exchange.exch_code}) ${this.primary_curr}/${this.base_curr}`;
                        let message = "Lowest value in > " + this.candles_1h.length + "h\n" + 
                         "Volume: " + Math.round(this.base_volume*100)/100 + " " + this.base_curr + " / " + Math.round(this.primary_volume*100)/100 + " " + this.primary_curr + "\nPrice: " + this.candles_1m[0].close + 
                         '\n' + this.GetCoinigyUrl() + '\n' + this.exchange.GetUrl(this.primary_curr, this.base_curr);
                        this.lastLowerTime = -999;
                        this.PlaySound();
                        // Create the graph and send to slack
                        this.CreateGraphic(this.candles_1h.length-24, 0, -1, title, message, currentLow);
                    }
                } // Alert once if there are no 1h candles
                else if (this.candles_1h.length == 0)
                {
                    if(this.lastLowerTime != -998) 
                        console.log("No 1h candles for: (" + this.exchange.exch_code + ") " + this.primary_curr + "/" + this.base_curr);
                    this.lastLowerTime = -998;
                }
            }
        }
    }
}
