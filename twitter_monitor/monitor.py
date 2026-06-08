import os
import time
import json
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

STATE_FILE = Path(__file__).parent / ".last_seen_id"


def get_since_id():
    if STATE_FILE.exists():
        return STATE_FILE.read_text().strip() or None
    return None


def save_since_id(tweet_id):
    STATE_FILE.write_text(tweet_id)


def search_tweets(bearer_token, username, keyword, since_id=None):
    headers = {"Authorization": f"Bearer {bearer_token}"}
    query = f"from:{username} {keyword} -is:retweet"
    params = {
        "query": query,
        "max_results": 10,
        "tweet.fields": "created_at,text",
        "sort_order": "recency",
    }
    if since_id:
        params["since_id"] = since_id

    resp = requests.get(
        "https://api.twitter.com/2/tweets/search/recent",
        headers=headers,
        params=params,
        timeout=10,
    )

    if resp.status_code == 429:
        reset_time = int(resp.headers.get("x-rate-limit-reset", time.time() + 60))
        wait = max(reset_time - int(time.time()), 60)
        print(f"Rate limited. Waiting {wait}s...")
        time.sleep(wait)
        return None

    resp.raise_for_status()
    return resp.json()


def send_notification(ntfy_topic, username, keyword, tweet_text):
    title = f"@{username} が「{keyword}」を投稿しました"
    requests.post(
        f"https://ntfy.sh/{ntfy_topic}",
        data=tweet_text.encode("utf-8"),
        headers={
            "Title": title.encode("utf-8"),
            "Priority": "default",
            "Tags": "bell,twitter",
        },
        timeout=10,
    )


def main():
    bearer_token = os.environ["TWITTER_BEARER_TOKEN"]
    username = os.environ["TWITTER_USERNAME"].lstrip("@")
    keyword = os.environ["WATCH_KEYWORD"]
    ntfy_topic = os.environ["NTFY_TOPIC"]
    interval = int(os.environ.get("CHECK_INTERVAL_SECONDS", "60"))

    since_id = get_since_id()
    print(f"Monitoring @{username} for keyword: 「{keyword}」")
    print(f"Notifications → ntfy.sh/{ntfy_topic}")
    print(f"Check interval: {interval}s\n")

    while True:
        try:
            data = search_tweets(bearer_token, username, keyword, since_id)

            if data is None:
                continue

            tweets = data.get("data", [])
            if tweets:
                save_since_id(tweets[0]["id"])
                since_id = tweets[0]["id"]

                for tweet in reversed(tweets):
                    print(f"[HIT] {tweet['text'][:80]}")
                    send_notification(ntfy_topic, username, keyword, tweet["text"])
            else:
                print(f"[{time.strftime('%H:%M:%S')}] No new matches.")

        except requests.RequestException as e:
            print(f"[ERROR] Network error: {e}")
        except Exception as e:
            print(f"[ERROR] {e}")

        time.sleep(interval)


if __name__ == "__main__":
    main()
