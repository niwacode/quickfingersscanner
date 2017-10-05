import { Ticker } from './../ticker';
import { CurrencyPair } from './../currencypair';
import { Exchange } from './../exchange';
var request = require('request');

export class Bittrex extends Exchange {
    exch_code = 'BTRX';
    exch_name = 'Bittrex';

    private symbolsUrl = 'https://bittrex.com/api/v1.1/public/getmarkets';
    private tickerUrl = 'https://bittrex.com/api/v1.1/public/getmarketsummaries';
    private pairsByName = {};
    private pairsInQueue : Array<any>;

    GetUrl(primary: string, base: string):string {
        return `https://bittrex.com/Market/Index?MarketName=${base}-${primary}`;
    }

    GetNextInQueue(finalCallback) {
        if(this.pairsInQueue.length > 0)
        {
            let x = this.pairsInQueue.shift();
            let cp = new CurrencyPair(x.MarketCurrency, x.BaseCurrency, this);
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
                this.pairsInQueue = JSON.parse(body).result;
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
                JSON.parse(body).result.forEach(element => {
                    let cp : CurrencyPair = this.pairsByName[element.MarketName];
                    if(cp) {
                        let ticker = new Ticker();
                        ticker.last_price = element.Last;
                        ticker.tick_time = Math.floor(+new Date(element.TimeStamp)/1000);
                        ticker.base_volume_24 = element.BaseVolume;
                        ticker.primary_volume_24 = element.Volume;
                        cp.NewTick(ticker);
                    }
                });
                callback();
            } else {
                if(err)
                {
                    console.log('BitTrex ticker error:');
                    console.log(err);
                } else {
                    console.log('BitTrex result code: ' + res.resultCode);
                }
                callback();
            }
        });                

    }
}