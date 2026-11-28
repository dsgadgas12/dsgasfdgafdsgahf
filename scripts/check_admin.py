import os,sys,tempfile,importlib.util
from pathlib import Path
from fastapi.testclient import TestClient
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
 os.environ.update(DATABASE_PATH=str(Path(tmp)/'test.db'),DEV_MODE='true',BOT_TOKEN='',ADMIN_TG_IDS='100000001',JWT_SECRET='local-isolated-test-secret-not-production')
 spec=importlib.util.spec_from_file_location('cg_backend',root/'backend/main.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 with TestClient(m.app) as client:
  admin=client.post('/api/auth/telegram',json={'init_data':'','start_param':'dev_100000001'}).json()
  user=client.post('/api/auth/telegram',json={'init_data':'','start_param':'dev_100000002'}).json()
  ah={'Authorization':'Bearer '+admin['access_token']};uh={'Authorization':'Bearer '+user['access_token']}
  def balance():return client.get('/api/me',headers=uh).json()['user']['balance']
  before=balance()
  assert client.post('/api/admin/users/100000002/balance',json={'amount':1000},headers=ah).status_code==200
  assert balance()==before+1000
  assert client.post('/api/admin/users/100000002/balance',json={'amount':-400},headers=ah).status_code==200
  assert balance()==before+600
  assert client.post('/api/admin/users/100000001/gift',json={'gift_id':'durovscap-1'},headers=ah).status_code==200
  assert any(x['gift_id']=='durovscap-1' for x in client.get('/api/me',headers=ah).json()['inventory'])
  assert client.post('/api/admin/users/100000002/balance',json={'amount':1000},headers=uh).status_code==403
  assert client.post('/api/admin/users/100000001/gift',json={'gift_id':'durovscap-1'},headers=uh).status_code==403
  assert client.post('/api/admin/users/999/balance',json={'amount':1000},headers=ah).status_code==404
  assert len(client.get('/api/admin/users?q=100000002',headers=ah).json())==1
  with m.connect() as con:assert con.execute('SELECT count(*) FROM action_logs').fetchone()[0]>=3
 print('PASS: admin credit, debit, own NFT grant, ID search, audit log; non-admin denied. Isolated temporary DB.')
