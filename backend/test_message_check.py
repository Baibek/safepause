"""«Тексеріп бер»: rules, fake brand domains and requisites found in the text (offline, no LLM)."""
import os

os.environ["SAFEPAUSE_LLM"] = "off"
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def fresh():
    client.post("/api/demo/reset", json={})


def check(text, lang="ru"):
    return client.post("/api/message/check", json={"text": text, "lang": lang}).json()


def test_olx_receive_money_by_link_is_a_scam():
    r = check("Купил ваш товар, оплатил через OLX доставку. Для получения денег перейдите по ссылке и введите номер карты и срок действия: https://olx-delivery.kz-pay.top/receive")
    assert r["verdict"] == "scam"
    assert any(x["fake"] and x["brand"] == "olx" for x in r["found"]["links"])


def test_official_domain_is_not_called_fake():
    r = check("Ваш платёж принят. Подробности в приложении или на https://kaspi.kz/shop")
    assert not any(x["fake"] for x in r["found"]["links"])


def test_lookalike_domain_is_fake():
    r = check("Ваша карта заблокирована, войдите: https://kaspi-bonus.top/login")
    link = r["found"]["links"][0]
    assert link["fake"] and link["domain"] == "kaspi-bonus.top"


def test_account_from_the_dropper_list_is_flagged():
    account = next(x for x in main.RECIPIENTS if x["id"] == "new_clean")["account"]   # KZ31 •••• 2208
    client.post("/api/analyst/droplist", json={"account": account, "reason": "test"})
    r = check("Переведите на счёт KZ31 1234 5678 9012 2208 срочно")
    req = r["found"]["requisites"][0]
    assert req["kind"] == "iban" and req["drop"] and r["verdict"] == "scam"
    assert "1234" not in req["value"]                                  # the full number is never echoed back


def test_card_and_phone_are_found_and_masked():
    r = check("Кидай на карту 4405 1234 5678 4471 или по номеру +7 705 123 93 40", "ru")
    kinds = {x["kind"]: x["value"] for x in r["found"]["requisites"]}
    assert kinds["card"].endswith("4471") and "1234" not in kinds["card"]
    assert kinds["phone"].endswith("40")


def test_prepayment_and_crypto_are_reasons():
    r = check("Только по предоплате, можно USDT")
    assert r["verdict"] in ("suspicious", "scam") and len(r["reasons"]) >= 2


def test_ordinary_message_stays_safe():
    r = check("Привет! Завтра в 7 встречаемся у бабушки, торт я привезу сама.")
    assert r["verdict"] == "safe" and r["found"] == {"links": [], "requisites": []}


def test_screenshot_without_ai_explains_how_to_proceed():
    png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    r = client.post("/api/message/check", json={"text": "", "image": png, "lang": "kk"})
    assert r.status_code == 503 and "мәтінін" in r.json()["detail"]


def test_screenshot_must_be_an_image():
    r = client.post("/api/message/check", json={"image": "data:text/html;base64,PGgxPg==", "lang": "kk"})
    assert r.status_code == 400
