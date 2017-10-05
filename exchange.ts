import {CurrencyPair} from './currencypair'

// Base class for exchanges
export class Exchange {
    exch_code: string;
    exch_name: string;
    currencyPairs: Array<CurrencyPair> = new Array<CurrencyPair>();

    GetCurrencyPairs(callback : (pairs: Array<CurrencyPair>)=>void) {
        callback(new Array<CurrencyPair>());
    }

    GetUrl(primary: string, base: string):string {
        return '';
    }
}