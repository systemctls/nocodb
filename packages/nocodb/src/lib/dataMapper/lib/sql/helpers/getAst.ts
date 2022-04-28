import View from '../../../../noco-models/View';
import { isSystemColumn, UITypes } from 'nocodb-sdk';
import Model from '../../../../noco-models/Model';
import LinkToAnotherRecordColumn from '../../../../noco-models/LinkToAnotherRecordColumn';

const getAst = async ({
  query,
  extractOnlyPrimaries = false,
  includePkByDefault = true,
  model,
  view
}: {
  query?: RequestQuery;
  extractOnlyPrimaries?: boolean;
  includePkByDefault?: boolean;
  model: Model;
  view?: View;
}) => {
  if (!model.columns?.length) await model.getColumns();
  if (extractOnlyPrimaries) {
    return {
      [model.primaryKey.title]: 1,
      [model.primaryValue.title]: 1
    };
  }

  let fields = query?.fields || query?.f;
  if (fields && fields !== '*') {
    fields = Array.isArray(fields) ? fields : fields.split(',');
  } else {
    fields = null;
  }

  let allowedCols = null;
  if (view)
    allowedCols = (await View.getColumns(view.id)).reduce(
      (o, c) => ({
        ...o,
        [c.fk_column_id]: c.show
      }),
      {}
    );

  return model.columns.reduce(async (obj, col) => {
    let value: number | boolean | { [key: string]: any } = 1;
    const nestedFields =
      query?.nested?.[col.title]?.fields || query?.nested?.[col.title]?.f;
    if (nestedFields && nestedFields !== '*') {
      if (col.uidt === UITypes.LinkToAnotherRecord) {
        const model = await col
          .getColOptions<LinkToAnotherRecordColumn>()
          .then(colOpt => colOpt.getRelatedTable());

        value = await getAst({
          model,
          query: query?.nested?.[col.title]
        });
      } else {
        value = (Array.isArray(fields) ? fields : fields.split(',')).reduce(
          (o, f) => ({ ...o, [f]: 1 }),
          {}
        );
      }
    } else if (col.uidt === UITypes.LinkToAnotherRecord) {
      const model = await col
        .getColOptions<LinkToAnotherRecordColumn>()
        .then(colOpt => colOpt.getRelatedTable());

      value = await getAst({
        model,
        query: query?.nested,
        extractOnlyPrimaries: true
      });
    }

    return {
      ...(await obj),
      [col.title]:
        allowedCols && (!includePkByDefault || !col.pk)
          ? allowedCols[col.id] &&
            (!isSystemColumn(col) || view.show_system_fields) &&
            (!fields?.length || fields.includes(col.title)) &&
            value
          : fields?.length
          ? fields.includes(col.title)
          : value
    };
  }, Promise.resolve({}));
};

type RequestQuery = {
  [fields in 'f' | 'fields']?: string | string[];
} & {
  nested?: {
    [field: string]: RequestQuery;
  };
};

export default getAst;