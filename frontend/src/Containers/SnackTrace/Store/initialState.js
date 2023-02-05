import StankTraceDto from '../Dto/StankTraceDto';

export default {
    traces: [StankTraceDto.createSuccess('picza'), StankTraceDto.createError('gowno na fioletowo'), StankTraceDto.createWarning('kielbasa z grochen na cieplo')],
}
