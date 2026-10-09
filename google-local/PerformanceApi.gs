function performanceApi_(request,u,store) {
  const url={pathname:'/api'+request.path},parts=url.pathname.split('/').filter(Boolean),method=request.method||'GET',b=JSON.parse(JSON.stringify(request.body||{}));
  const send=(res,status,data)=>data,res=null;
  if(url.pathname==='/api/me')return {user:pPublicUser_(u),csrf:'rpc-token',mustChange:false,hasLocalPin:false};
  if(url.pathname==='/api/logout')return {ok:true};
  const catalog=['departments','roles','objectives','kpis','templates','users'];
  const text=(v,max=200)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
  const admin=u=>pFail_(u.role==='ADMIN','Acesso reservado ao administrador.',403);
  const scoped=(u,e)=>pCanManage_(u,e)||u.id===e.id;
  if(url.pathname==='/api/strategy-map') {
    pFail_(['ADMIN','CHEFIA','DIRECAO'].includes(u.role),'Sem acesso ao BSC da empresa.',403);
    const old=store.get('strategy-map','company');
    if(method==='GET')return old;
    if(method==='PUT') {
      admin(u);pFail_((old?.version||0)===b.expectedVersion,'A imagem mudou. Recarregue.',409);
      pFail_(text(b.name)&&typeof b.description==='string'&&b.description.length<=2000,'Título ou descrição inválidos.');
      pFail_(typeof b.imageData==='string'&&b.imageData.length<=800000&&/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(b.imageData),'Escolha uma imagem PNG ou JPEG válida.');
      const encoded=b.imageData.split(',')[1];
      pFail_(encoded.length%4===0&&(b.imageData.startsWith('data:image/png;')?encoded.startsWith('iVBORw0KGgo'):encoded.startsWith('/9j/')),'Conteúdo de imagem inválido.');
      return store.transaction(()=>store.save('strategy-map',{id:'company',name:b.name.trim(),description:b.description,imageData:b.imageData},u.id));
    }
  }
  function validateEntity(kind,b,old) {
    pFail_(text(b.name),'Nome em falta.');
    if(['templates','objectives','kpis'].includes(kind)) {
      if(old&&['approved','active'].includes(old.status)&&['approved','active','archived'].includes(b.status))pFail_(pDefinitionFingerprint_(old)===pDefinitionFingerprint_(b),'Alterar regras aprovadas exige uma nova versão Em definição.');
      pFail_(pStates_.includes(b.status),'Estado inválido.');
      if(!old)pFail_(b.status==='definition','Criar em definição antes da validação.');
      else if(b.status!==old.status)pFail_(b.status==='archived'||pStates_.indexOf(b.status)===pStates_.indexOf(old.status)+1&&old.status!=='archived'||b.status==='definition'&&old.status!=='archived','Transição de indicador/modelo inválida.');
      // A new version of an already approved/active definition must be validated again.
      if(old&&['approved','active'].includes(old.status)&&b.status===old.status) {
        const omit=x=>JSON.stringify(Object.fromEntries(Object.entries(x).filter(([key])=>!['id','version','updatedAt','expectedVersion','status'].includes(key)).sort(([a],[c])=>a.localeCompare(c))));
        pFail_(omit(old)===omit(b),'Alterar regras aprovadas requer devolver esta nova versão a Em definição. Avaliações anteriores mantêm-se.');
      }
    }
    if(kind==='users') {
      b.number=old?old.number:b.number; b.role=old?old.role:'COLABORADOR';
      pFail_(typeof b.number==='string'&&/^[1-9][0-9]{0,14}$/.test(b.number),'Número de colaborador inválido.');
      pFail_(!store.list('users').some(e=>e.id!==b.id&&e.number===b.number),'Este número de colaborador já existe.');
      pFail_(['ADMIN','DIRECAO','CHEFIA','COLABORADOR'].includes(b.role)&&typeof b.active==='boolean','Perfil inválido.');
      pFail_(text(b.username)&&/^[a-zA-Z0-9._-]{1,80}$/.test(b.username),'Identificador de acesso inválido.');
      pFail_(!store.list('users').some(u=>u.id!==b.id&&u.username.toLowerCase()===b.username.toLowerCase()),'Identificador já existe.');
      pFail_(!b.oid || /^[a-f0-9-]{36}$/i.test(b.oid),'Object ID Microsoft inválido.');
      pFail_(!b.oid || !store.list('users').some(u=>u.id!==b.id&&u.oid===b.oid),'Identidade Microsoft já associada.');
      if(old&&old.managerId!==(b.managerId||''))pFail_(!store.list('evaluations').some(e=>e.employeeId===b.id),'A chefia desta avaliação histórica está fixada. Atribua a chefia antes de criar avaliações.');
      if(b.managerId) {const manager=store.get('users',b.managerId);pFail_(manager?.active&&['ADMIN','CHEFIA'].includes(manager.role)&&b.managerId!==b.id,'Chefia inválida.');let next=manager;const seen=new Set([b.id]);while(next){pFail_(!seen.has(next.id),'Ciclo de chefias inválido.');seen.add(next.id);next=next.managerId?store.get('users',next.managerId):null;}}
      if(b.departmentId)pFail_(store.get('departments',b.departmentId),'Departamento inválido.');
      if(b.roleId)pFail_(store.get('roles',b.roleId),'Função inválida.');
      if(old?.role==='ADMIN'&&old.active&&(b.role!=='ADMIN'||!b.active))pFail_(store.list('users').some(u=>u.id!==b.id&&u.active&&u.role==='ADMIN'),'Deve existir um administrador ativo.');
      b={id:b.id,name:b.name,username:b.username,number:b.number,role:b.role,active:b.active,departmentId:b.departmentId||'',roleId:b.roleId||'',managerId:b.managerId||'',oid:b.oid||''};
    }
    if(kind==='templates'){pValidateTemplate_(b);if(['approved','active'].includes(b.status))pFail_(b.objectives.flatMap(o=>o.criteria).concat(b.skills||[]).every(c=>b.status==='active'?c.status==='active':['approved','active'].includes(c.status)),'Todos os critérios devem ser aprovados antes do modelo.');pFail_(store.get('roles',b.roleId),'Função inválida.');for(const o of b.objectives) for(const id of o.strategicIds||[])pFail_(store.get('objectives',id),'Objetivo estratégico inválido.');pFail_(pStates_.includes(b.status),'Estado inválido.');}
    if(kind==='objectives') {pFail_(['corporate','department'].includes(b.scope)&&pStates_.includes(b.status),'Objetivo inválido.');if(b.scope==='department'){pFail_(store.get('departments',b.departmentId),'Departamento inválido.');pFail_(store.get('objectives',b.parentId)?.scope==='corporate','Associar a objetivo corporativo.');}}
    if(kind==='kpis') {pFail_(!b.targetPeriod||/^\d{4}-(M(0[1-9]|1[0-2])|Q[1-4]|A)$/.test(b.targetPeriod),'Período da meta inválido.');pFail_(store.get('objectives',b.objectiveId),'Objetivo inválido.');pFail_(pStates_.includes(b.status)&&['higher','lower','zero','manual'].includes(b.direction),'Indicador inválido.');if(['active','approved'].includes(b.status))pFail_(b.definition&&b.unit&&(b.direction==='manual'||Number.isFinite(b.target)&&(b.direction==='zero'?b.target===0:b.target>0)),'Definir unidade, regra e meta antes da aprovação.');}
    return b;
  }
      if(url.pathname==='/api/catalog'&&method==='GET') {
        const result={};for(const kind of catalog) {let rows=store.list(kind);if(kind==='users')rows=rows.filter(e=>scoped(u,e)).map(pPublicUser_);if(u.role==='CHEFIA'&&kind==='objectives')rows=rows.filter(o=>o.scope==='department'&&o.departmentId===u.departmentId);if(u.role==='CHEFIA'&&kind==='kpis')rows=rows.filter(k=>store.get('objectives',k.objectiveId)?.scope==='department'&&store.get('objectives',k.objectiveId)?.departmentId===u.departmentId);if(!['ADMIN','DIRECAO','CHEFIA'].includes(u.role)&&kind!=='users')rows=rows.filter(e=>kind==='roles'?e.id===u.roleId:kind==='departments'?e.id===u.departmentId: false);result[kind]=rows;}return send(res,200,result);
      }
      if(parts[1]==='catalog'&&catalog.includes(parts[2])&&['POST','PUT'].includes(method)) {
        admin(u);const kind=parts[2],id=method==='POST'?pRandomUUID_():parts[3],old=store.get(kind,id);if(method==='PUT')pFail_(old&&old.version===b.expectedVersion,'Versão mudou. Recarregue.',409);
        const clean=validateEntity(kind,{...b,id},old);delete clean.expectedVersion;
        const saved=store.transaction(()=>store.save(kind,clean,u.id));return send(res,200,saved);
      }
      if(parts[1]==='versions'&&method==='GET') {admin(u);pFail_(catalog.includes(parts[2]),'Tipo inválido.');return send(res,200,store.versions(parts[2],parts[3]));}
      if(url.pathname==='/api/sync-local'&&method==='POST'){admin(u);for(const local of rows_('Users'))performanceLinkLocal_(local,request.adminToken,u.id);return {ok:true};}
      if(parts[1]==='legacy-history'&&method==='GET'){const employee=store.get('users',parts[2]||u.id);pFail_(employee&&scoped(u,employee),'Histórico indisponível.',403);return {evaluations:source_({name:employee.name,number:employee.number,role:store.get('roles',employee.roleId)?.name||'',department:store.get('departments',employee.departmentId)?.name||''},request.adminToken)};}
      if(url.pathname==='/api/audit'&&method==='GET'){admin(u);return send(res,200,store.auditLog());}
      if(url.pathname==='/api/self-assessments'&&method==='GET')return send(res,200,store.list('evaluations').filter(e=>e.employeeId===u.id).map(e=>({id:e.id,version:e.version,period:e.period,state:e.state,template:e.template,selfAssessment:e.selfAssessment,employee:e.employee})));
      if(parts[1]==='evaluations') {
        if(method==='GET') {let rows=store.list('evaluations').filter(e=>{const emp=store.get('users',e.employeeId);return emp&&pCanRead_(u,e,emp);});if(parts[2]){const e=rows.find(e=>e.id===parts[2]);pFail_(e,'Avaliação não disponível.',404);return send(res,200,e);}return send(res,200,rows);}
        if(method==='POST'&&!parts[2]) {
          const employee=store.get('users',b.employeeId),template=store.get('templates',b.templateId);
          pFail_(employee?.active&&pCanManage_(u,employee),'Sem permissão para avaliar este colaborador.',403);
          pFail_(template?.status==='active'&&template.roleId===employee.roleId,'Modelo ativo da função em falta.');pValidateTemplate_(template);
          pFail_(/^\d{4}-(M(0[1-9]|1[0-2])|Q[1-4]|A)$/.test(b.period),'Período: AAAA-M01, AAAA-Q1 ou AAAA-A.');
          pFail_(!store.list('evaluations').some(e=>e.employeeId===employee.id&&e.period===b.period),'Já existe uma avaliação para este período.',409);
          const e={id:pRandomUUID_(),employeeId:employee.id,employee:pPublicUser_(employee),period:b.period,template:pClone_(template),state:'draft',results:{},selfAssessment:{},comment:'',improvementPlan:'',seriousIncident:false,incidentReview:'',calculation:pCalculate_(template,{}),acknowledgement:null};
          const saved=store.transaction(()=>store.save('evaluations',e,u.id));performanceMirrorTask_(saved);return saved;
        }
        const old=store.get('evaluations',parts[2]);pFail_(old,'Avaliação inexistente.',404);const employee=store.get('users',old.employeeId);pFail_(employee,'Colaborador inexistente.',404);
        pFail_(old.version===b.expectedVersion,'A avaliação mudou. Recarregue.',409);
        if(parts[3]==='acknowledge'&&method==='POST') {pFail_(u.id===employee.id&&old.state==='published','Só pode confirmar a própria avaliação publicada.',403);pFail_(!old.acknowledgement,'Tomada de conhecimento já registada.',409);pFail_(typeof b.comment==='string'&&b.comment.length<=10000,'Observação inválida.');return send(res,200,store.transaction(()=>store.save('evaluations',{...old,acknowledgement:{at:new Date().toISOString(),userId:u.id,comment:b.comment}},u.id)));}
        if(parts[3]==='self'&&method==='POST') {pFail_(u.id===employee.id&&['draft','evaluation'].includes(old.state),'Autoavaliação indisponível nesta fase.',403);pValidateResults_(old.template,b.results);return send(res,200,store.transaction(()=>store.save('evaluations',{...old,selfAssessment:pClone_(b.results)},u.id)));}
        pFail_(pCanManage_(u,employee),'Sem permissão para avaliar.',403);
        if(parts[3]==='reopen'&&method==='POST') {admin(u);pFail_(['validation','approved'].includes(old.state),'Só pode reabrir avaliações em validação ou aprovadas.');pFail_(text(b.reason,10000),'Registe o motivo da reabertura.');return send(res,200,store.transaction(()=>store.save('evaluations',{...old,state:'evaluation',reopened:{at:new Date().toISOString(),by:u.id,reason:b.reason}},u.id)));}
        if(parts[3]==='transition'&&method==='POST') {
          const current=pWorkflow_.indexOf(old.state),next=pWorkflow_.indexOf(b.state);pFail_(current<4&&next===current+1,'Transição inválida.');
          if(next>=3)admin(u);
          if(next>=3){pFail_(old.calculation.complete,'Avaliação incompleta: indicadores pendentes ou N/A.');pFail_(!old.seriousIncident||text(old.incidentReview,10000),'Registar revisão explícita de incidente grave antes de aprovar.');}
          const saved=store.transaction(()=>store.save('evaluations',{...old,state:b.state,...(b.state==='published'?{publishedAt:new Date().toISOString(),publishedBy:u.id}:{})},u.id));performanceMirrorTask_(saved);if(b.state==='published')performanceMirrorPublication_(saved,u.id);return saved;
        }
        if(method==='PUT'&&!parts[3]) {
          pFail_(['draft','evaluation'].includes(old.state),'Avaliação bloqueada após submissão.');pValidateResults_(old.template,b.results);
          pFail_(typeof b.comment==='string'&&typeof b.improvementPlan==='string'&&b.comment.length<=10000&&b.improvementPlan.length<=10000,'Comentários inválidos.');
          return send(res,200,store.transaction(()=>store.save('evaluations',{...old,results:pClone_(b.results),comment:b.comment,improvementPlan:b.improvementPlan,seriousIncident:!!b.seriousIncident,incidentReview:String(b.incidentReview||'').slice(0,10000),calculation:pCalculate_(old.template,b.results)},u.id)));
        }
      }
      if(parts[1]==='bsc-results') {
        pFail_(['ADMIN','DIRECAO','CHEFIA'].includes(u.role),'Sem acesso a resultados BSC.',403);
        const allowed=(k,snapshot)=> {const o=snapshot||store.get('objectives',k.objectiveId);return u.role!=='CHEFIA'||o?.scope==='department'&&o.departmentId===u.departmentId;};
        if(method==='GET')return send(res,200,store.list('bsc-results').filter(r=>allowed(r.kpi,r.objective)));
        if(method==='POST') {pFail_(u.role!=='DIRECAO','Perfil de consulta.',403);const k=store.get('kpis',b.kpiId);pFail_(k?.status==='active'&&allowed(k),'Indicador indisponível.',403);pFail_(/^\d{4}-(M(0[1-9]|1[0-2])|Q[1-4]|A)$/.test(b.period),'Período inválido.');pFail_(!k.targetPeriod||b.period===k.targetPeriod,'Esta meta aplica-se apenas a '+k.targetPeriod+'. Defina uma meta adequada ao período.');pValidateResults_({objectives:[{criteria:[{...k,id:k.id}]}]},{[k.id]:b.result});
          const id=k.id+':'+b.period,old=store.get('bsc-results',id);pFail_(!old||old.version===b.expectedVersion,'Resultado alterado. Recarregue.',409);pFail_(!old||allowed(old.kpi,old.objective),'Sem acesso ao período histórico.',403);
          return send(res,200,store.transaction(()=>store.save('bsc-results',{id,kpi:pClone_(old?.kpi||k),objective:pClone_(old?.objective||store.get('objectives',k.objectiveId)),period:b.period,result:pClone_(b.result)},u.id)));
        }
      }
      throw new pProblem_(404,'Operação inexistente.');
}
