import { Ticker } from './../ticker';
import { CurrencyPair } from './../currencypair';
import { Exchange } from './../exchange';
var request = require('request');

export class Binance extends Exchange {
    exch_code = 'BINA';
    exch_name = 'Binance';

    private symbolsUrl = 'https://api.binance.com/api/v1/ticker/24hr';
    private tickerUrl = 'https://api.binance.com/api/v1/ticker/allPrices';
    private pairsByName = {};
    private pairsInQueue : Array<any>;

    GetUrl(primary: string, base: string):string {
        return `https://www.binance.com/trade.html?symbol=${primary}_${base}`;
    }

    GetNextInQueue(finalCallback) {
        if(this.pairsInQueue.length > 0)
        {
            let x = this.pairsInQueue.shift();
            let symbol: string = x.symbol;
            let curr1 = symbol.substring(0, symbol.length-3);
            let curr2 = symbol.substring(symbol.length-3);
            if(symbol.indexOf('USDT')>0) {
                curr1 = symbol.substring(0, symbol.length-4);
                curr2 = symbol.substring(symbol.length-4);    
            }
            let cp = new CurrencyPair(curr1, curr2, this);
            cp.base_volume = x.quoteVolume;
            cp.primary_volume = x.volume;
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
        request(this.symbolsUrl, (err, res, body) => {
            if (!err && res.statusCode == 200) {
                this.pairsInQueue = JSON.parse(body);
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
                tickers.forEach(element => {
                    let cp : CurrencyPair = this.pairsByName[element.symbol];
                    if(cp) {
                        let ticker = new Ticker();
                        ticker.last_price = element.price;
                        ticker.tick_time = Math.floor(+new Date()/1000);
                        ticker.base_volume_24 = cp.base_volume;
                        ticker.primary_volume_24 = cp.primary_volume;
                        cp.NewTick(ticker);
                    }
                });
                callback();
            } else {
                if(err)
                {
                    console.log('Binance ticker error:');
                    console.log(err);
                } else {
                    console.log('Binance result code: ' + res.resultCode);
                }
                callback();
            }
        });                

    }

    GetLastOrders(currency1:string, currency2:string, timestamp: number, callback) {
        request(`https://www.binance.com/api/v1/trades?symbol=${currency1.toUpperCase()}${currency2.toUpperCase()}`, (err, res, body) => {
            if (!err && res.statusCode == 200) {
                
                let result = JSON.parse(body).reverse();
                let lastTimeStamp = result[0].time;
                let sameTimeOrders = 0;
                let tempNoOrders = 0;
                let tempTimeStamp = lastTimeStamp;
                result.forEach(element => {
                    if(element.time == tempTimeStamp)
                        tempNoOrders++;
                    else
                    {
                        sameTimeOrders = Math.max(sameTimeOrders, tempNoOrders);
                        if(lastTimeStamp - element.time < 3000)
                        {
                             tempTimeStamp = element.time;
                             tempNoOrders = 1;   
                        } else
                        {
                            tempNoOrders = 0;
                        }
                    }
                });
                callback(sameTimeOrders);
            } else {
                if(err)
                {
                    console.log('Bittrex last prices error:');
                    console.log(err);
                } else {
                    console.log('Bittrex last prices result code: ' + res.resultCode);
                }
                callback(0);
            }            
        });
    }

}