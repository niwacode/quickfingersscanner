import { Ticker } from './../ticker';
import { CurrencyPair } from './../currencypair';
import { Exchange } from './../exchange';
var request = require('request');

export class Poloniex extends Exchange {
    exch_code = 'PLNX';
    exch_name = 'Poloniex';

    private symbolsUrl = 'https://poloniex.com/public?command=returnTicker';
    private tickerUrl = 'https://poloniex.com/public?command=returnTicker';
    private pairsByName = {};
    private pairsInQueue : Array<any>;

    GetUrl(primary: string, base: string):string {
        return `https://poloniex.com/exchange#${primary.toLowerCase()}_${base.toLowerCase()}`;
    }

    GetNextInQueue(finalCallback) {
        if(this.pairsInQueue.length > 0)
        {
            let x = this.pairsInQueue.shift();
            let cp = new CurrencyPair(x.Primary, x.Base, this);
            cp.GetHistory(() => {
                this.currencyPairs.push(cp);
                this.pairsByName[x.MarketName] = cp;     
                this.GetNextInQueue(finalCallback);   
            });
        } else {
            finalCallback(this.currencyPairs);
        }
    }

    GetCurrencyPairs(callback : (pairs: Array<CurrencyPair>)=>void) {
        request(this.symbolsUrl, (err, res, body) => {
            if (!err && res.statusCode == 200) {
                let pairs = new Array<any>();
                let jsonbody = JSON.parse(body);
                for(var key in jsonbody) {
                    let currencies = key.split('_');
                    pairs.push({MarketName: key, Base: currencies[1], Primary: currencies[0]});
                }
                this.pairsInQueue = pairs;
                this.GetNextInQueue(callback);
            } else {
                console.log('Error');
                console.log(err);
            }
        });                
    }
    
    TickerTimer(time_ms: number) {
        setTimeout(()=> {
            this.GetTicker(() => {
                this.TickerTimer(time_ms);
            });
        }, time_ms);
    }

    GetTicker(callback) {
        request(this.tickerUrl, (err, res, body) => {
            if (!err && res.statusCode == 200) {
                let tickers = JSON.parse(body);

                for(var key in tickers) {
                    let element = tickers[key];
                    let cp : CurrencyPair = this.pairsByName[key];
                    if(cp) {
                        let ticker = new Ticker();
                        ticker.last_price = element.last;
                        ticker.tick_time = Math.floor(+new Date()/1000);
                        ticker.base_volume_24 = element.quoteVolume;
                        ticker.primary_volume_24 = element.baseVolume;
                        cp.NewTick(ticker);
                    }
                };
                callback();
            } else {
                if(err)
                {
                    console.log('Poloniex ticker error:');
                    console.log(err);
                } else {
                    console.log('Poloniex result code: ' + res.resultCode);
                }
                callback();
            }
        });                

    }
}