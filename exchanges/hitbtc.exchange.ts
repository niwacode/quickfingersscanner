import { Ticker } from './../ticker';
import { CurrencyPair } from './../currencypair';
import { Exchange } from './../exchange';
var request = require('request');

export class HitBtc extends Exchange {
    exch_code = 'HITB';
    exch_name = 'HitBtc';

    private symbolsUrl = 'http://api.hitbtc.com/api/1/public/symbols';
    private tickerUrl = 'http://api.hitbtc.com/api/1/public/ticker';
    private pairsByName = {};
    private pairsInQueue : Array<any>;

    GetUrl(primary: string, base: string):string {
        return `https://hitbtc.com/exchange/${primary}-to-${base}`;
    }

    GetNextInQueue(finalCallback) {
        if(this.pairsInQueue.length > 0)
        {
            let x = this.pairsInQueue.shift();
            let cp = new CurrencyPair(x.commodity, x.currency, this);
            cp.GetHistory(() => {
                this.currencyPairs.push(cp);
                this.pairsByName[x.symbol] = cp;
                this.GetNextInQueue(finalCallback);   
            });
        } else {
            finalCallback(this.currencyPairs);
        }
    }

    GetCurrencyPairs(callback : (pairs: Array<CurrencyPair>)=>void) {
        let pairs = Array<CurrencyPair>();
        
        request(this.symbolsUrl, (err, res, body) => {
            if (!err && res.statusCode == 200) {
                this.pairsInQueue = JSON.parse(body).symbols;
                this.GetNextInQueue(callback);

            } else {
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
                for(let p in tickers) {
                    let cp : CurrencyPair = this.pairsByName[p];
                    if(cp) {
                        let ticker = new Ticker();
                        ticker.last_price = tickers[p].last;
                        ticker.tick_time = Math.floor(tickers[p].timestamp/1000);
                        ticker.base_volume_24 = tickers[p].volume_quote;
                        ticker.primary_volume_24 = tickers[p].volume;
                        cp.NewTick(ticker);
                    }
                }
                callback();
            } else {
                if(err)
                {
                    console.log('HitBtc ticker error:');
                    console.log(err);
                } else {
                    console.log('HitBtc result code: ' + res.resultCode);
                }
                callback();
            }
        });                

    }
}