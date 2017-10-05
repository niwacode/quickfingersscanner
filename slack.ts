var WebClient = require('@slack/client').WebClient;
var fs = require('fs');

// Class to post messaages with image to slack
export class Slack {

    static web = null;
    
    static setKey = (key) => {
        Slack.web = new WebClient(key);
    }    
    
    send = (slackGroup, url, title, message, ts, callback) => {
        if(Slack.web) {
            Slack.web.chat.postMessage(slackGroup, '',{attachments: [{"title": title, image_url: url, text:message}], as_user: true, reply_broadcast: true, thread_ts: ts}, function(err, res) {
                if (err) {
                    console.log('Error:', err);
                } else {
                    if(res.message.thread_ts)
                        callback(res.message.thread_ts);
                    else
                        callback(res.ts);
                }
            });
        }
    }
}
