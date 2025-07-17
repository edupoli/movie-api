CREATE OR REPLACE FUNCTION update_programacao_status()
RETURNS TRIGGER AS $$
DECLARE
    v_current_date DATE := CURRENT_DATE;
    v_has_schedule BOOLEAN;
BEGIN
    -- Verificando se tem horários de programação válidos conforme a regra
    -- Verificamos se pelo menos um dos dias tem formato de programação completo (data + horários + tipo de sessão)
    v_has_schedule := 
        (NEW.segunda ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (NEW.terca ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (NEW.quarta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (NEW.quinta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (NEW.sexta ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (NEW.sabado ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)') OR
        (NEW.domingo ~ '\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+\([^)]+\)');

    -- Regras de status conforme especificação
    
    -- INATIVO: quando semana_fim já passou
    IF NEW.semana_fim < v_current_date THEN
        NEW.status := 'inativo';
    
    -- INATIVO: dentro do período mas sem programação definida
    ELSIF v_current_date BETWEEN NEW.semana_inicio AND NEW.semana_fim AND NOT v_has_schedule THEN
        NEW.status := 'inativo';
    
    -- EM CARTAZ: dentro do período e com programação definida
    ELSIF v_current_date BETWEEN NEW.semana_inicio AND NEW.semana_fim AND v_has_schedule THEN
        NEW.status := 'em cartaz';
    
    -- PRE VENDA: data_estreia no futuro e já tem programação definida
    ELSIF NEW.data_estreia > v_current_date AND v_has_schedule THEN
        NEW.status := 'pre venda';
    
    -- EM BREVE: data_estreia no futuro e sem programação definida
    ELSIF NEW.data_estreia > v_current_date AND NOT v_has_schedule THEN
        NEW.status := 'em breve';
    
    -- Caso não caia em nenhuma regra específica, considerar inativo
    ELSE
        NEW.status := 'inativo';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;