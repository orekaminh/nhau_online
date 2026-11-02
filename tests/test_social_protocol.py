"""Authoritative WC lock and room chat protocol checks, without browser/GPU."""
import unittest
from fastapi.testclient import TestClient
from app import app, rooms

def until(ws, kind):
    for _ in range(30):
        value = ws.receive_json()
        if value['type'] == kind:
            return value
    raise AssertionError('Missing ' + kind)

class SocialProtocolTests(unittest.TestCase):
    def test_wc_ownership_chat_and_disconnect(self):
        room_id = 'test_social_protocol'
        rooms.pop(room_id, None)
        with TestClient(app) as client:
            with client.websocket_connect('/ws/' + room_id + '/one') as one:
                until(one, 'init')
                with client.websocket_connect('/ws/' + room_id + '/two') as two:
                    until(two, 'init')
                    for ws in (one, two):
                        ws.send_json({'action': 'move', 'x': -16.4, 'z': -2.7})
                    one.send_json({'action': 'wc_enter'})
                    self.assertTrue(until(one, 'wc_result')['entered'])
                    self.assertEqual(until(two, 'wc_state')['occupant_id'], 'one')
                    two.send_json({'action': 'wc_enter'})
                    self.assertIn('đang có người', until(two, 'wc_notice')['message'])
                    two.send_json({'action': 'move', 'x': -20, 'z': -2})
                    correction = until(two, 'position_correction')
                    self.assertEqual(correction['x'], -16.4)
                    # A client cannot clear another person's lock or claim to use their toilet.
                    two.send_json({'action': 'wc_exit'})
                    two.send_json({'action': 'pee', 'spot_type': 'wc'})
                    until(two, 'wc_notice')
                    self.assertEqual(rooms[room_id].wc_occupant, 'one')
                    one.send_json({'action': 'pee', 'spot_type': 'wc'})
                    self.assertEqual(until(one, 'pee_event')['bladder_level'], 0)
                    text = '<img src=x onerror=alert(1)> Chào anh em!'
                    two.send_json({'action': 'chat', 'text': text})
                    self.assertEqual(until(one, 'chat_event')['text'], text)
                    self.assertEqual(until(two, 'chat_event')['member_id'], 'two')
                    two.send_json({'action': 'chat', 'text': 'Gửi liên tục'})
                    until(two, 'chat_error')
                    # Closing the WC owner's connection releases the door for the next player.
                    one.close()
                    self.assertIsNone(until(two, 'wc_state')['occupant_id'])
                    two.send_json({'action': 'wc_enter'})
                    self.assertTrue(until(two, 'wc_result')['entered'])
                    two.send_json({'action': 'wc_exit'})
                    self.assertFalse(until(two, 'wc_result')['entered'])
                    self.assertIsNone(rooms[room_id].wc_occupant)

    def test_long_chat_and_walk_entry(self):
        room_id = 'test_social_walk'
        rooms.pop(room_id, None)
        with TestClient(app) as client:
            with client.websocket_connect('/ws/' + room_id + '/walker') as ws:
                until(ws, 'init')
                ws.send_json({'action': 'move', 'x': -16.4, 'z': -2.7})
                ws.send_json({'action': 'move', 'x': -19.2, 'z': -2.7})
                self.assertEqual(until(ws, 'wc_state')['occupant_id'], 'walker')
                ws.send_json({'action': 'move', 'x': -16.4, 'z': -2.7})
                self.assertIsNone(until(ws, 'wc_state')['occupant_id'])
                ws.send_json({'action': 'chat', 'text': 'a' * 500})
                self.assertEqual(len(until(ws, 'chat_event')['text']), 160)

if __name__ == '__main__':
    unittest.main()
